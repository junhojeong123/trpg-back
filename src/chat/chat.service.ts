import { Injectable, Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import createDOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
import { plainToClass } from 'class-transformer';
import { validate } from 'class-validator';
import { JoinRoomDto } from './dto/join-room.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { DiceService } from '../dice/dice.service';
import { RateLimitService } from './rate-limit.service';

// DOMPurify 초기화 (XSS 방지)
const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window as any);

// 설정 상수
const MAX_MESSAGE_LENGTH = 200;           // 메시지 최대 길이
const RATE_LIMIT_WINDOW_MS = 60000;       // 속도 제한 시간 창 (1분)

/**
 * 채팅 서비스
 */
@Injectable()
export class ChatService {
  // 로거 인스턴스
  private readonly logger = new Logger(ChatService.name);

  // 서비스 주입
  constructor(
    private readonly diceService: DiceService,
    private readonly rateLimitService: RateLimitService,
  ) {}

  /**
   * 방 입장 처리
   */
  async handleJoinRoom(
    client: Socket,
    clientData: any,
    dto: JoinRoomDto,
    server: Server,
    clients: Map<string, any>
  ) {
    try {
      const { roomCode } = dto;

      // 기존에 참여한 방이 있다면 퇴장 처리
      if (clientData.roomCode) {
        client.leave(clientData.roomCode);
        server.to(clientData.roomCode).emit('user_left', { nickname: clientData.nickname });
      }

      // 새로운 방 입장
      client.join(roomCode);
      clientData.roomCode = roomCode;

      // 입장 성공 알림 (본인 + 방 내 다른 사용자)
      client.emit('joined_room', { roomCode });
      client.to(roomCode).emit('user_joined', { nickname: clientData.nickname });
    } catch (error) {
      this.logger.error('방 참여 오류', error.stack);
      client.emit('error', { code: 'SERVER_ERROR', reason: '방 참여에 실패했습니다' });
    }
  }

  /**
   * 방 퇴장 처리
   */
  async handleLeaveRoom(
    client: Socket,
    clientData: any,
    server: Server,
    clients: Map<string, any>
  ) {
    const { roomCode, nickname } = clientData;

    // 1. 방에서 퇴장
    client.leave(roomCode);

    // 2. 클라이언트 정보 업데이트
    clientData.roomCode = undefined;

    // 3. 방 내 다른 사용자에게 퇴장 알림
    server.to(roomCode).emit('user_left', { nickname });

    // 4. 성공 응답
    client.emit('left_room', { roomCode });
  }

  /**
   * 메시지 전송 처리
   */
  async handleSendMessage(client: Socket, clientData: any, data: any, server: Server) {
    try {
      // 1. DTO로 변환
      const dto = plainToClass(SendMessageDto, data);
      
      // 2. 검증 실행
      const errors = await validate(dto);

      // 3. 검증 실패 시 에러 전송
      if (errors.length > 0) {
        client.emit('error', { code: 'VALIDATION_ERROR', reason: '입력값 검증 실패' });
        return;
      }

      const { roomCode, message } = dto;

      // 방 입장 여부 확인
      if (!clientData.roomCode || clientData.roomCode !== roomCode) {
        client.emit('error', { code: 'INVALID_ROOM', reason: '해당 방에 참여하지 않았습니다' });
        return;
      }

      // 속도 제한 확인
      if (await this.rateLimitService.isRateLimited(clientData.userId)) {
        client.emit('error', { 
          code: 'RATE_LIMITED', 
          reason: '메시지 전송 제한 초과. 1분 후 다시 시도해 주세요.',
          retryAfter: RATE_LIMIT_WINDOW_MS,
        });
        return;
      }

      // 공백 메시지 제한
      const trimmedMessage = message.trim();
      if (!trimmedMessage) {
        client.emit('error', { code: 'EMPTY_MESSAGE', reason: '메시지 내용이 비어 있습니다' });
        return;
      }

      // XSS 방지를 위한 메시지 정제
      const cleanMessage = DOMPurify.sanitize(trimmedMessage, {
        ALLOWED_TAGS: [],      // 모든 태그 허용 안 함
        ALLOWED_ATTR: [],      // 모든 속성 허용 안 함
      });

      // 메시지 길이 제한
      if (cleanMessage.length > MAX_MESSAGE_LENGTH) {
        client.emit('error', { 
          code: 'MESSAGE_TOO_LONG', 
          reason: `메시지는 최대 ${MAX_MESSAGE_LENGTH}자까지 가능합니다` 
        });
        return;
      }

      // 주사위 명령어 처리
      // 예: "/roll 2d6+3" 형식의 명령어
      if (cleanMessage.startsWith('/roll')) {
        //  1. "/roll " 제거 및 공백 정리
        const diceCommand = cleanMessage.replace(/^\/roll\s+/, '').trim();
        
        //  2. 순수 주사위 명령어만 전달
        const result = this.diceService.rollCommand(diceCommand);
      
        //  3. 결과 메시지 구성
        const resultPayload = {
          senderId: 'System',
          nickname: '주사위',
          message: `${clientData.nickname}의 주사위 결과: ${result.total} (${result.detail})`,
          roomCode,
          timestamp: new Date(),
        };
        
        //  4. 방에 결과 전송
        server.to(roomCode).emit('receive_message', resultPayload);
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
        await this.saveMessage(payload);

        // 해당 방 사용자들에게 메시지 전송
        server.to(roomCode).emit('receive_message', payload);
      } catch (error) {
        this.logger.error('메시지 저장 실패', error.stack);
        client.emit('error', { code: 'SERVER_ERROR', reason: '메시지 처리에 실패했습니다' });
      }
    } catch (error) {
      this.logger.error('메시지 처리 오류', error.stack);
      client.emit('error', { code: 'SERVER_ERROR', reason: '메시지 처리에 실패했습니다' });
    }
  }

  
  async handleGetChatLogs(client: Socket, roomCode: string) {
    try {
      // DB에서 채팅 기록 조회
      const logs = await this.getMessages(roomCode);

      // 클라이언트에게 전송
      client.emit('chat_logs', logs);
    } catch (error) {
      this.logger.error('채팅 기록 조회 실패', error.stack);
      client.emit('error', { code: 'SERVER_ERROR', reason: '채팅 기록 조회에 실패했습니다' });
    }
  }


  async saveMessage(payload: any) {

    this.logger.log(`메시지 저장: ${payload.message}`);
  }



  async getMessages(roomCode: string) {

    return [
      {
        senderId: 'system',
        nickname: '시스템',
        message: '환영합니다!',
        roomCode,
        timestamp: new Date(),
      }
    ];
  }
}