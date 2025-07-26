import { 
  WebSocketGateway, 
  WebSocketServer, 
  SubscribeMessage, 
  OnGatewayConnection, 
  OnGatewayDisconnect 
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';
import createDOMPurify from 'dompurify';
import { RateLimitService } from './rate-limit.service';
import { JSDOM } from 'jsdom';
import { Logger } from '@nestjs/common';
import { DiceController } from 'src/dice/dice.controller';

// DTO 및 검증 관련 모듈 추가
import { plainToClass } from 'class-transformer';
import { validate } from 'class-validator';
import { JoinRoomDto } from './dto/join-room.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { DiceService } from 'src/dice/dice.service';

// 메시지 길이, 속도 제한 등의 설정 상수
const MAX_MESSAGE_LENGTH = 200;
const RATE_LIMIT_WINDOW_MS = 60000;

// DOMPurify 초기화 
const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window as unknown as any);

// WebSocket 게이트웨이 설정 
@WebSocketGateway({   cors: { origin: '*', 
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  }
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  // NestJS의 Logger 사용
  private readonly logger = new Logger(ChatGateway.name);

  // 클라이언트별 접속 정보 저장 
  private clients: Map<string, { 
    userId: string; 
    nickname: string;
    roomCode?: string;
  }> = new Map();

  constructor(
    private readonly chatService: ChatService,
    private readonly rateLimitService: RateLimitService,
    private readonly diceService: DiceService,
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

    if (!clientData) {
      this.emitError(client, 'UNAUTHORIZED', '인증 필요');
      return;
    }

    try {
      // 1. DTO로 변환
      const dto = plainToClass(JoinRoomDto, data);
      
      // 2. 검증 실행
      const errors = await validate(dto);

      if (errors.length > 0) {
        // 3. 검증 실패 시 에러 전송
        this.emitError(client, 'VALIDATION_ERROR', '입력값 검증 실패');
        return;
      }

      const { roomCode } = dto;

      // 기존에 참여한 방이 있다면 퇴장 처리
      if (clientData.roomCode) {
        client.leave(clientData.roomCode);
        this.server.to(clientData.roomCode).emit('user_left', { nickname: clientData.nickname });
      }

      // 새로운 방 입장
      client.join(roomCode);
      clientData.roomCode = roomCode;

      // 입장 성공 알림 (본인 + 방 내 다른 사용자)
      client.emit('joined_room', { roomCode });
      client.to(roomCode).emit('user_joined', { nickname: clientData.nickname });
    } catch (error) {
      this.logger.error('방 참여 오류', error.stack);
      this.emitError(client, 'SERVER_ERROR', '방 참여에 실패했습니다');
    }
  }
  /**
 * 방 퇴장 요청 핸들러
 */
@SubscribeMessage('leave_room')
async handleLeaveRoom(client: Socket) {
  const clientData = this.clients.get(client.id);

  if (!clientData || !clientData.roomCode) {
    this.emitError(client, 'NOT_IN_ROOM', '현재 방에 참여하지 않았습니다');
    return;
  }

  const { roomCode, nickname } = clientData;

  // 1. 방에서 퇴장
  client.leave(roomCode);

  // 2. 클라이언트 정보 업데이트
  clientData.roomCode = undefined;

  // 3. 방 내 다른 사용자에게 퇴장 알림
  this.server.to(roomCode).emit('user_left', { nickname });

  // 4. 성공 응답
  client.emit('left_room', { roomCode });
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

    try {
      // 1. DTO로 변환
      const dto = plainToClass(SendMessageDto, data);
      
      // 2. 검증 실행
      const errors = await validate(dto);

      if (errors.length > 0) {
        // 3. 검증 실패 시 에러 전송
        this.emitError(client, 'VALIDATION_ERROR', '입력값 검증 실패');
        return;
      }

      const { roomCode, message } = dto;

      // 방 입장 여부 확인
      if (!clientData.roomCode || clientData.roomCode !== roomCode) {
        this.emitError(client, 'INVALID_ROOM', '해당 방에 참여하지 않았습니다');
        return;
      }

      // 속도 제한 확인
      if (await this.rateLimitService.isRateLimited(clientData.userId)) {
        this.emitError(client, 'RATE_LIMITED', '메시지 전송 제한 초과. 1분 후 다시 시도해 주세요.', {
          retryAfter: RATE_LIMIT_WINDOW_MS,
        });
        return;
      }

      // 공백 메시지 제한
      const trimmedMessage = message.trim();
      if (!trimmedMessage) {
        this.emitError(client, 'EMPTY_MESSAGE', '메시지 내용이 비어 있습니다');
        return;
      }

      // XSS 방지를 위한 메시지 정제
      const cleanMessage = DOMPurify.sanitize(trimmedMessage, {
        ALLOWED_TAGS: [],
        ALLOWED_ATTR: [],
      });


      // 메시지 길이 제한
      if (cleanMessage.length > MAX_MESSAGE_LENGTH) {
        this.emitError(client, 'MESSAGE_TOO_LONG', `메시지는 최대 ${MAX_MESSAGE_LENGTH}자까지 가능합니다`);
        return;
      }
      // 주사위 명령어 처리
      // 예: "/roll 2d6+3" 형식의 명령어
      if (cleanMessage.startsWith('/roll')) {
  const result = this.diceService.rollCommand(cleanMessage);
  const resultPayload = {
    senderId: 'System',
    nickname: ' 주사위',
    message: `${clientData.nickname}의 주사위 결과: ${result.total} (${result.detail})`,
    roomCode,
    timestamp: new Date(),
  };
  this.server.to(roomCode).emit('receive_message', resultPayload);
  return;
}

      // 전송할 메시지 정보 구성
      const payload = {
        senderId: clientData.userId,
        nickname: clientData.nickname,
        message: cleanMessage,
        roomCode,
        timestamp: new Date(),
      };

      try {
        // DB 저장
        await this.chatService.saveMessage(payload);

        // 해당 방 사용자들에게 메시지 전송
        this.server.to(roomCode).emit('receive_message', payload);
      } catch (error) {
        this.logger.error('메시지 저장 실패', error.stack);
        this.emitError(client, 'SERVER_ERROR', '메시지 처리에 실패했습니다');
      }
    } catch (error) {
      this.logger.error('메시지 처리 오류', error.stack);
      this.emitError(client, 'SERVER_ERROR', '메시지 처리에 실패했습니다');
    }
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

    try {
      // DB에서 채팅 기록 조회
      const logs = await this.chatService.getMessages(roomCode);

      // 클라이언트에게 전송
      client.emit('chat_logs', logs);
    } catch (error) {
      this.logger.error('채팅 기록 조회 실패', error.stack);
      this.emitError(client, 'SERVER_ERROR', '채팅 기록 조회에 실패했습니다');
    }
  }
}