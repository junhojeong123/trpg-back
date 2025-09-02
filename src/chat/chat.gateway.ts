// src/modules/chat/chat.gateway.ts
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
  OnGatewayInit,
} from '@nestjs/websockets';
import { ValidationPipe, Logger, UsePipes } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';
import { JoinRoomDto } from './dto/join-room.dto';
import { SendMessageDto } from './dto/send-message.dto';

/**
 * WebSocket 게이트웨이
 * - 연결/해제/재연결 관리
 * - 이벤트 수신 후 ChatService로 위임
 */
@WebSocketGateway({
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(ChatGateway.name);

  // socketId -> clientData
  private clients = new Map<
    string,
    { userId: string; nickname: string; roomCode?: string }
  >();

  // userId -> disconnect timer
  private disconnectTimeouts = new Map<string, NodeJS.Timeout>();
  private readonly RECONNECT_GRACE_PERIOD_MS = 15000; // 15초

  constructor(private readonly chatService: ChatService) {}

  afterInit(server: Server) {
    this.logger.log('Chat Gateway Initialized');
  }

  /** 공통 에러 응답 */
  private emitError(
    client: Socket,
    code: string,
    reason: string,
    extra: Record<string, any> = {},
  ) {
    client.emit('chat:error', { code, reason, ...extra });
  }

  /** userId로 기존 소켓 찾기 */
  private findClientByUserId(userId: string) {
    for (const [socketId, data] of this.clients.entries()) {
      if (data.userId === userId) return { socketId, data };
    }
    return null;
  }

  /** 연결 */
  handleConnection(client: Socket) {
    try {
      const { userId, nickname } = client.handshake.auth as {
        userId?: string;
        nickname?: string;
      };

      if (!userId || !nickname) {
        this.emitError(client, 'UNAUTHORIZED', '인증 필요');
        client.disconnect();
        return;
      }

      // 재접속 처리
      const existing = this.findClientByUserId(userId);
      if (existing) {
        const prevSocketId = existing.socketId;
        const prevData = existing.data;

        this.clients.delete(prevSocketId);
        const pending = this.disconnectTimeouts.get(userId);
        if (pending) {
          clearTimeout(pending);
          this.disconnectTimeouts.delete(userId);
        }

        this.clients.set(client.id, {
          userId,
          nickname,
          roomCode: prevData.roomCode,
        });

        this.logger.log(
          `재연결: user=${userId}, socket(old)=${prevSocketId} → (new)=${client.id}`,
        );

        if (prevData.roomCode) {
          client.join(prevData.roomCode);
          this.server
            .to(prevData.roomCode)
            .emit('chat:userReconnected', { nickname, userId });
          client.emit('chat:joinedRoom', { roomCode: prevData.roomCode });
        } else {
          client.emit('chat:system', { message: '서버에 재연결되었습니다.' });
        }
        return;
      }

      // 신규 연결
      this.clients.set(client.id, { userId, nickname });
      this.logger.log(
        `연결됨: ${nickname} (userId=${userId}, socket=${client.id})`,
      );

      client.emit('chat:system', {
        message: '서버에 연결되었습니다.',
        socketId: client.id,
      });
    } catch (err) {
      this.logger.error('handleConnection 오류', err as any);
    }
  }

  /** 연결 해제 (유예 적용) */
  handleDisconnect(client: Socket) {
    try {
      const clientData = this.clients.get(client.id);
      if (!clientData) {
        this.logger.log(`알 수 없는 소켓 해제: ${client.id}`);
        return;
      }

      const { userId, nickname, roomCode } = clientData;
      this.clients.delete(client.id);

      const prevTimer = this.disconnectTimeouts.get(userId);
      if (prevTimer) {
        clearTimeout(prevTimer);
        this.disconnectTimeouts.delete(userId);
      }

      const timeout = setTimeout(() => {
        const found = this.findClientByUserId(userId);
        if (!found) {
          if (roomCode) {
            this.server.to(roomCode).emit('chat:userLeft', { nickname });
          }
          this.logger.log(
            `유예기간 후 오프라인 처리: user=${userId}, room=${roomCode}`,
          );
        } else {
          this.logger.log(
            `유예기간 중 재접속 → 오프라인 처리 취소: user=${userId}`,
          );
        }
        this.disconnectTimeouts.delete(userId);
      }, this.RECONNECT_GRACE_PERIOD_MS);

      this.disconnectTimeouts.set(userId, timeout);

      this.logger.log(
        `연결 해제 예약: user=${userId}, socket=${client.id}, wait=${this.RECONNECT_GRACE_PERIOD_MS}ms`,
      );
    } catch (err) {
      this.logger.error('handleDisconnect 오류', err as any);
    }
  }

  /** 방 입장 */
  @SubscribeMessage('chat:joinRoom')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: JoinRoomDto,
  ) {
    const clientData = this.clients.get(client.id);
    if (!clientData) {
      this.emitError(client, 'UNAUTHORIZED', '인증 필요');
      return;
    }

    try {
      // ChatService의 비즈니스 로직 호출
      await this.chatService.joinRoom(clientData.userId, dto.roomCode, clientData.roomCode);
      
      // Gateway에서의 Socket 처리
      const previousRoom = clientData.roomCode;
      if (previousRoom && previousRoom !== dto.roomCode) {
        client.leave(previousRoom);
        this.server.to(previousRoom).emit('chat:userLeft', { nickname: clientData.nickname });
      }

      client.join(dto.roomCode);
      clientData.roomCode = dto.roomCode;
      this.clients.set(client.id, clientData);

      client.emit('chat:joinedRoom', { roomCode: dto.roomCode });
      client.to(dto.roomCode).emit('chat:userJoined', { nickname: clientData.nickname });
      
      this.logger.log(`사용자 ${clientData.userId}가 방 ${dto.roomCode}에 입장`);
    } catch (error) {
      this.emitError(client, 'JOIN_ROOM_FAILED', error.message || '방 입장에 실패했습니다');
    }
  }

  /** 방 퇴장 */
  @SubscribeMessage('chat:leaveRoom')
  async handleLeaveRoom(@ConnectedSocket() client: Socket) {
    const clientData = this.clients.get(client.id);
    if (!clientData || !clientData.roomCode) {
      this.emitError(client, 'NOT_IN_ROOM', '현재 방에 참여하지 않았습니다');
      return;
    }

    try {
      const roomCode = clientData.roomCode;
      
      // ChatService의 비즈니스 로직 호출
      await this.chatService.leaveRoom(clientData.userId, roomCode);
      
      // Gateway에서의 Socket 처리
      client.leave(roomCode);
      clientData.roomCode = undefined;
      this.clients.set(client.id, clientData);

      this.server.to(roomCode).emit('chat:userLeft', { nickname: clientData.nickname });
      client.emit('chat:leftRoom', { roomCode });
      
      this.logger.log(`사용자 ${clientData.userId}가 방 ${roomCode}에서 퇴장`);
    } catch (error) {
      this.emitError(client, 'LEAVE_ROOM_FAILED', error.message || '방 퇴장에 실패했습니다');
    }
  }

  /** 메시지 전송 */
  @SubscribeMessage('chat:sendMessage')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: SendMessageDto,
  ) {
    const clientData = this.clients.get(client.id);
    if (!clientData) {
      this.emitError(client, 'UNAUTHORIZED', '인증 필요');
      return;
    }

    if (!clientData.roomCode || clientData.roomCode !== dto.roomCode) {
      this.emitError(client, 'INVALID_ROOM', '해당 방에 참여하지 않았습니다');
      return;
    }

    try {
      // ChatService의 비즈니스 로직 호출
      const savedMessage = await this.chatService.sendMessage(
        dto,
        clientData.userId,
        clientData.nickname,
        dto.roomCode
      );

      // Gateway에서의 Socket 처리
      const messagePayload = {
        id: savedMessage.id,
        senderId: savedMessage.senderId,
        nickname: savedMessage.nickname,
        message: savedMessage.message,
        roomCode: savedMessage.roomCode,
        timestamp: savedMessage.timestamp,
      };

      this.server.to(dto.roomCode).emit('chat:receiveMessage', messagePayload);
      
      this.logger.log(`메시지 전송 완료: ${savedMessage.id}`);
    } catch (error) {
      this.emitError(client, 'SEND_MESSAGE_FAILED', error.message || '메시지 전송에 실패했습니다');
    }
  }

  /** 채팅 기록 요청 */
  @SubscribeMessage('chat:getLogs')
  async handleGetChatLogs(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomCode: string; limit?: number },
  ) {
    const { roomCode, limit } = data;
    const clientData = this.clients.get(client.id);

    if (!clientData || clientData.roomCode !== roomCode) {
      this.emitError(client, 'INVALID_ROOM', '해당 방에 참여하지 않았습니다');
      return;
    }

    try {
      // ChatService의 비즈니스 로직 호출
      const logs = await this.chatService.getMessages(roomCode, limit);
      client.emit('chat:chatLogs', logs);
    } catch (error) {
      this.emitError(client, 'GET_LOGS_FAILED', error.message || '채팅 기록 조회에 실패했습니다');
    }
  }
}