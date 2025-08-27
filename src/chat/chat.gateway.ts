import { 
  WebSocketGateway, 
  WebSocketServer, 
  SubscribeMessage, 
  OnGatewayConnection, 
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';
import { Logger } from '@nestjs/common';
import { plainToClass } from 'class-transformer';
import { validate } from 'class-validator';
import { JoinRoomDto } from './dto/join-room.dto';
import { SendMessageDto } from './dto/send-message.dto';

/**
 * WebSocket 게이트웨이 설정
 * 클라이언트의 소켓 연결 및 이벤트 수신만 담당
 */
@WebSocketGateway({
  cors: { 
    origin: '*', 
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  }
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  // Socket.IO 서버 인스턴스
  @WebSocketServer() server: Server;

  // 로거 인스턴스
  private readonly logger = new Logger(ChatGateway.name);

  // 클라이언트별 접속 정보 저장: socketId -> clientData
  private clients: Map<string, { 
    userId: string; 
    nickname: string;
    roomCode?: string;
  }> = new Map();

  // disconnect 유예 타이머: userId -> timeout
  private disconnectTimeouts: Map<string, NodeJS.Timeout> = new Map();

  // 유예 기간(ms): 이 시간 내 재연결되면 offline 브로드캐스트를 막음
  private readonly RECONNECT_GRACE_PERIOD_MS = 15000; // 15초

  // 서비스 주입
  constructor(
    private readonly chatService: ChatService,
  ) {}

  /**
   * 공통 에러 응답 유틸 함수
   */
  private emitError(client: Socket, code: string, reason: string, extra: Record<string, any> = {}) {
    client.emit('error', { code, reason, ...extra });
  }

  /**
   * userId로 기존 소켓 엔트리 찾기
   */
  private findClientEntryByUserId(userId: string): { socketId: string; data: { userId: string; nickname: string; roomCode?: string } } | null {
    for (const [socketId, data] of this.clients.entries()) {
      if (data.userId === userId) return { socketId, data };
    }
    return null;
  }

  /**
   * 연결 시 (접속 또는 재접속 처리)
   */
  handleConnection(client: Socket) {
    try {
      // 핸드셰이크에서 전달받은 인증 정보
      const { userId, nickname } = client.handshake.auth as { userId?: string; nickname?: string };

      // 인증 실패 시 연결 종료
      if (!userId || !nickname) {
        this.emitError(client, 'UNAUTHORIZED', '인증 필요');
        client.disconnect();
        return;
      }

      // 이미 같은 userId로 다른 소켓이 존재하는지 검사 (재접속 가능성)
      const existing = this.findClientEntryByUserId(userId);

      if (existing) {
        // 이전 연결이 아직 맵에 남아있다면(아직 disconnect 타이머가 작동 중일 수 있음)
        // 이전 소켓 엔트리를 제거하고 새 소켓으로 교체
        const prevSocketId = existing.socketId;
        const prevData = existing.data;

        // 제거: 이전 소켓 매핑 삭제 (해당 소켓의 실제 연결은 이미 끊겼을 수 있음)
        this.clients.delete(prevSocketId);

        // 기존에 예약된 disconnect 타이머가 있으면 취소(재연결 됨)
        const pending = this.disconnectTimeouts.get(userId);
        if (pending) {
          clearTimeout(pending);
          this.disconnectTimeouts.delete(userId);
        }

        // 새 매핑으로 등록
        this.clients.set(client.id, { userId, nickname, roomCode: prevData.roomCode });

        this.logger.log(`재연결 감지: user=${userId}, socket (old)-> ${prevSocketId} (new)-> ${client.id}`);

        // 만약 이전에 속해 있던 방이 있다면 자동으로 재가입 처리
        if (prevData.roomCode) {
          try {
            client.join(prevData.roomCode);
            // 전통적인 'user_joined' 이벤트 대신 재접속을 알리는 이벤트를 보냄
            this.server.to(prevData.roomCode).emit('user_reconnected', { nickname, userId });
            // 클라이언트에게도 알림 (클라이언트는 필요하면 UI 복구)
            client.emit('joined_room', { roomCode: prevData.roomCode });
            this.logger.log(`자동 재가입 완료: user=${userId}, room=${prevData.roomCode}`);
          } catch (err) {
            this.logger.error('자동 재가입 중 오류', err as any);
          }
        } else {
          // 방이 없으면 단순 접속 알림
          client.emit('system', { message: '서버에 재연결되었습니다.' });
        }

        return;
      }

      // 신규 연결이면 일반 등록
      this.clients.set(client.id, { userId, nickname });
      this.logger.log(`클라이언트 연결됨: ${nickname} (userId=${userId}, socket=${client.id})`);

      // 환영 메시지 전송 및 전체 알림(프로토타입용)
      client.emit('system', { message: '서버에 연결되었습니다.', socketId: client.id });
      this.server.emit('system', { message: `${nickname}님이 접속했습니다.` });
    } catch (err) {
      this.logger.error('handleConnection 오류', err as any);
    }
  }

  /**
   * 연결 해제 시 (유예 타이머 시작)
   * - 즉시 완전 퇴장으로 처리하지 않고 일정 시간(유예) 동안 재접속을 기다립니다.
   */
  handleDisconnect(client: Socket) {
    try {
      const clientData = this.clients.get(client.id);

      // 제거 전 정보 보관
      if (!clientData) {
        this.logger.log(`알 수 없는 소켓 연결 해제: ${client.id}`);
        return;
      }

      const { userId, nickname, roomCode } = clientData;

      // 클라이언트 매핑 삭제 (즉시 삭제해서 새 소켓이 동일 userId로 들어올 수 있게 함)
      this.clients.delete(client.id);

      // 만약 이미 유예 타이머가 있으면 제거(보통 없을 것)
      const prevTimer = this.disconnectTimeouts.get(userId);
      if (prevTimer) {
        clearTimeout(prevTimer);
        this.disconnectTimeouts.delete(userId);
      }

      // 유예 타이머 등록: 일정 시간 동안 재연결을 기다림
      const timeout = setTimeout(() => {
        // 유예 시간이 지나도 재접속 정보가 없다면 완전 퇴장 처리
        const found = this.findClientEntryByUserId(userId);
        if (!found) {
          // 방에 참여 중이었다면 퇴장 알림 전송
          if (roomCode) {
            this.server.to(roomCode).emit('user_left', { nickname });
          }
          this.server.emit('system', { message: `${nickname}님이 오프라인 상태입니다.` });
          this.logger.log(`유예기간 후 오프라인 처리: user=${userId}, room=${roomCode}`);
        } else {
          // 재접속된 경우는 이미 처리됨
          this.logger.log(`유예기간 중 재접속 감지되어 오프라인 처리 취소: user=${userId}`);
        }
        this.disconnectTimeouts.delete(userId);
      }, this.RECONNECT_GRACE_PERIOD_MS);

      this.disconnectTimeouts.set(userId, timeout);

      this.logger.log(`연결 해제 예약(유예): user=${userId}, socket=${client.id}, wait=${this.RECONNECT_GRACE_PERIOD_MS}ms`);
    } catch (err) {
      this.logger.error('handleDisconnect 오류', err as any);
    }
  }

   // 방 입장 요청 핸들러

  @SubscribeMessage('join_room')
  async handleJoinRoom(@ConnectedSocket() client: Socket, @MessageBody() data: any) {
    const clientData = this.clients.get(client.id);

    // 인증 확인
    if (!clientData) {
      this.emitError(client, 'UNAUTHORIZED', '인증 필요');
      return;
    }

    // DTO로 변환 및 검증
    const dto = plainToClass(JoinRoomDto, data);
    const errors = await validate(dto);

    // 검증 실패 시 에러 전송
    if (errors.length > 0) {
      this.emitError(client, 'VALIDATION_ERROR', '입력값 검증 실패');
      return;
    }

    // 서비스에 위임
    await this.chatService.handleJoinRoom(client, clientData, dto, this.server, this.clients);
  }

  /**
   * 방 퇴장 요청 핸들러
   */
  @SubscribeMessage('leave_room')
  async handleLeaveRoom(@ConnectedSocket() client: Socket) {
    const clientData = this.clients.get(client.id);

    // 방 참여 여부 확인
    if (!clientData || !clientData.roomCode) {
      this.emitError(client, 'NOT_IN_ROOM', '현재 방에 참여하지 않았습니다');
      return;
    }

    // 서비스에 위임
    await this.chatService.handleLeaveRoom(client, clientData, this.server, this.clients);
  }

  /**
   * 메시지 전송 핸들러
   */
  @SubscribeMessage('send_message')
  async handleMessage(@ConnectedSocket() client: Socket, @MessageBody() data: any) {
    const clientData = this.clients.get(client.id);

    // 인증 확인
    if (!clientData) {
      this.emitError(client, 'UNAUTHORIZED', '인증 필요');
      return;
    }

    // 서비스에 위임
    await this.chatService.handleSendMessage(client, clientData, data, this.server);
  }

  /**
   * 채팅 기록 요청 핸들러
   */
  @SubscribeMessage('get_chat_logs')
  async handleGetChatLogs(@ConnectedSocket() client: Socket, @MessageBody() data: { roomCode: string }) {
    const { roomCode } = data;
    const clientData = this.clients.get(client.id);

    // 참여 여부 확인
    if (!clientData || clientData.roomCode !== roomCode) {
      this.emitError(client, 'INVALID_ROOM', '해당 방에 참여하지 않았습니다');
      return;
    }

    // 서비스에 위임
    await this.chatService.handleGetChatLogs(client, roomCode);
  }
}
