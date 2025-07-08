import { WebSocketGateway, WebSocketServer, SubscribeMessage, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';
import createDOMPurify from 'dompurify'; // <-- 기본 import 방식으로 수정
import { RateLimitService } from './rate-limit.service';
import { JSDOM } from 'jsdom';

// JSDOM 기반 window 객체 생성
const window = new JSDOM('').window;

// DOMPurify 인스턴스 생성 (any 캐스팅으로 타입 에러 회피)
const DOMPurify = createDOMPurify(window as any);

@WebSocketGateway({ cors: true })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  private clients: Map<string, { userId: string; nickname: string }> = new Map();

  constructor(private readonly chatService: ChatService,
    private readonly rateLimitService: RateLimitService,
  ) {}
  /**
   * 클라이언트 연결 시 실행
   */
  handleConnection(client: Socket) {
    const { userId, nickname } = client.handshake.auth;

    if (!userId || !nickname) {
      client.disconnect();
      return;
    }

    this.clients.set(client.id, { userId, nickname });
    console.log(`Client connected: ${nickname}`);
  }

  /**
   * 클라이언트 연결 해제 시 실행
   */
  handleDisconnect(client: Socket) {
    this.clients.delete(client.id);
    console.log('Client disconnected');
  }

  /**
   * 방 입장 이벤트
   */
  @SubscribeMessage('join_room')
  handleJoinRoom(client: Socket, data: { roomCode: string }) {
    const { roomCode } = data;

    if (!roomCode || roomCode.length < 4) {
      client.emit('error', { reason: 'Invalid room code' });
      return;
    }

    client.join(roomCode);
    client.emit('joined_room', { roomCode });

    client.to(roomCode).emit('user_joined', {
      nickname: this.clients.get(client.id)?.nickname,
    });
  }

  /**
   * 메시지 전송 이벤트
   * → DB 저장 포함
   */
    @SubscribeMessage('send_message')
  async handleMessage(client: Socket, data: { roomCode: string; message: string }) {
    const { roomCode, message } = data;
    const user = this.clients.get(client.id);

    if (!user) {
      client.emit('error', { reason: 'Unauthorized' });
      return;
    }
     if (await this.rateLimitService.isRateLimited(user.userId)) {
    client.emit('error', { reason: '메시지 전송 제한 초과 (1분 후 다시 시도)' });
    return;
  }


    if (!roomCode || !message) {
      client.emit('error', { reason: 'Invalid message data' });
      return;
    }

    // DOMPurify 존재 여부 확인
    if (!DOMPurify) {
      client.emit('error', { reason: 'DOMPurify not initialized' });
      return;
    }

    //  XSS 방지: 메시지 정제
    const cleanMessage = DOMPurify.sanitize(message, {
      // 필요시 특정 HTML 태그 허용 (보안을 위해 기본적으로는 비추천)
      // 예: <b>, <i> 허용
      // ALLOWED_TAGS: ['b', 'i', 'u', 'br'],
      // ALLOWED_ATTR: [],
    });

    //  메시지 길이 제한 (예: 최대 500자)
    if (cleanMessage.length > 500) {
      client.emit('error', { reason: 'Message too long' });
      return;
    }

    const payload = {
      senderId: user.userId,
      nickname: user.nickname,
      message: cleanMessage, //  정제된 메시지 사용
      roomCode,
    };

    //  DB 저장
    await this.chatService.saveMessage(payload);

    //  메시지 브로드캐스트
    this.server.to(roomCode).emit('receive_message', {
      ...payload,
      timestamp: new Date(),
    });
  }

  /**
   * 채팅 로그 조회
   */
  @SubscribeMessage('get_chat_logs')
  async handleGetChatLogs(client: Socket, data: { roomCode: string }) {
    const logs = await this.chatService.getMessages(data.roomCode);
    client.emit('chat_logs', logs);
  }
}
