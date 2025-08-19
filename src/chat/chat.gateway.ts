import { 
  WebSocketGateway, 
  WebSocketServer, 
  SubscribeMessage, 
  OnGatewayConnection, 
  OnGatewayDisconnect 
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

  // 클라이언트별 접속 정보 저장
  private clients: Map<string, { 
    userId: string; 
    nickname: string;
    roomCode?: string;
  }> = new Map();

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
   * 클라이언트 연결 시 실행
   */
  handleConnection(client: Socket) {
    // 핸드셰이크에서 전달받은 인증 정보
    const { userId, nickname } = client.handshake.auth as { userId?: string; nickname?: string };

    // 인증 실패 시 연결 종료
    if (!userId || !nickname) {
      this.emitError(client, 'UNAUTHORIZED', '인증 필요');
      client.disconnect();
      return;
    }

    // 유저 정보 등록
    this.clients.set(client.id, { userId, nickname });
    this.logger.log(`클라이언트 연결됨: ${nickname}`);
  }

  /**
   * 클라이언트 연결 해제 시 실행
   */
  handleDisconnect(client: Socket) {
    const clientData = this.clients.get(client.id);
    
    if (clientData) {
      const { nickname, roomCode } = clientData;

      // 방에 참여 중이었다면 퇴장 알림 전송
      if (roomCode) {
        this.server.to(roomCode).emit('user_left', { nickname });
      }

      this.logger.log(`클라이언트 연결 해제됨: ${nickname}`);
    }

    // 메모리 정리
    this.clients.delete(client.id);
  }

  /**
   * 방 입장 요청 핸들러
   */
  @SubscribeMessage('join_room')
  async handleJoinRoom(client: Socket, data: any) {
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
  async handleLeaveRoom(client: Socket) {
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
  async handleMessage(client: Socket, data: any) {
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
  async handleGetChatLogs(client: Socket, data: { roomCode: string }) {
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