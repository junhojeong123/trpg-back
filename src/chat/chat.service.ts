import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Server, Socket } from 'socket.io';
import createDOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
import { plainToClass } from 'class-transformer';
import { validate } from 'class-validator';
import { JoinRoomDto } from './dto/join-room.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { DiceService } from '../dice/dice.service';
import { RateLimitService } from './rate-limit.service';
import { Chatmessage } from './entities/chat-message.entity';

// DOMPurify 초기화 (XSS 방지)
const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window as any);

// 설정 상수
const MAX_MESSAGE_LENGTH = 200;
const RATE_LIMIT_WINDOW_MS = 60000;

/**
 * 채팅 서비스
 * 실제 비즈니스 로직 처리 (검증, 저장, 처리 등)
 */
@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly diceService: DiceService,
    private readonly rateLimitService: RateLimitService,
    
    @InjectRepository(Chatmessage)
    private readonly ChatmessageRepository: Repository<Chatmessage>,
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

      if (clientData.roomCode) {
        client.leave(clientData.roomCode);
        server.to(clientData.roomCode).emit('user_left', { nickname: clientData.nickname });
      }

      client.join(roomCode);
      clientData.roomCode = roomCode;

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

    client.leave(roomCode);
    clientData.roomCode = undefined;

    server.to(roomCode).emit('user_left', { nickname });
    client.emit('left_room', { roomCode });
  }

  /**
   * 메시지 전송 처리
   */
  async handleSendMessage(client: Socket, clientData: any, data: any, server: Server) {
    try {
      const dto = plainToClass(SendMessageDto, data);
      const errors = await validate(dto);

      if (errors.length > 0) {
        client.emit('error', { code: 'VALIDATION_ERROR', reason: '입력값 검증 실패' });
        return;
      }

      const { roomCode, message } = dto;

      if (!clientData.roomCode || clientData.roomCode !== roomCode) {
        client.emit('error', { code: 'INVALID_ROOM', reason: '해당 방에 참여하지 않았습니다' });
        return;
      }

      if (await this.rateLimitService.isRateLimited(clientData.userId)) {
        client.emit('error', { 
          code: 'RATE_LIMITED', 
          reason: '메시지 전송 제한 초과. 1분 후 다시 시도해 주세요.',
          retryAfter: RATE_LIMIT_WINDOW_MS,
        });
        return;
      }

      const trimmedMessage = message.trim();
      if (!trimmedMessage) {
        client.emit('error', { code: 'EMPTY_MESSAGE', reason: '메시지 내용이 비어 있습니다' });
        return;
      }

      const cleanMessage = DOMPurify.sanitize(trimmedMessage, {
        ALLOWED_TAGS: [],
        ALLOWED_ATTR: [],
      });

      if (cleanMessage.length > MAX_MESSAGE_LENGTH) {
        client.emit('error', { 
          code: 'MESSAGE_TOO_LONG', 
          reason: `메시지는 최대 ${MAX_MESSAGE_LENGTH}자까지 가능합니다` 
        });
        return;
      }

      if (cleanMessage.startsWith('/roll')) {
        const diceCommand = cleanMessage.replace(/^\/roll\s+/, '').trim();
        const result = this.diceService.rollCommand(diceCommand);
        
        const resultPayload = {
          senderId: 'System',
          nickname: '주사위',
          message: `${clientData.nickname}의 주사위 결과: ${result.total} (${result.detail})`,
          roomCode,
          timestamp: new Date(),
        };
        
        server.to(roomCode).emit('receive_message', resultPayload);
        return;
      }

      const payload = {
        senderId: clientData.userId,
        nickname: clientData.nickname,
        message: cleanMessage,
        roomCode,
        timestamp: new Date(),
      };

      try {
        await this.saveMessage(payload);
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

  /**
   * 채팅 기록 조회 처리
   */
  async handleGetChatLogs(client: Socket, roomCode: string) {
    try {
      const logs = await this.getMessages(roomCode);
      client.emit('chat_logs', logs);
    } catch (error) {
      this.logger.error('채팅 기록 조회 실패', error.stack);
      client.emit('error', { code: 'SERVER_ERROR', reason: '채팅 기록 조회에 실패했습니다' });
    }
  }

  /**
   * 메시지 DB 저장
   */
  async saveMessage(payload: any): Promise<Chatmessage> {
    try {
      const chatMessage = this.ChatmessageRepository.create({
        roomCode: payload.roomCode,
        senderId: payload.senderId,
        nickname: payload.nickname,
        message: payload.message,
        timestamp: payload.timestamp,
      });

      const savedMessage = await this.ChatmessageRepository.save(chatMessage);
      this.logger.log(`메시지 저장 완료: ${savedMessage.id}`);
      
      return savedMessage;
    } catch (error) {
      this.logger.error('메시지 저장 실패', error.stack);
      throw error;
    }
  }

  /**
   * 채팅 기록 조회
   */
  async getMessages(roomCode: string): Promise<Chatmessage[]> {
    try {
      const messages = await this.ChatmessageRepository
        .createQueryBuilder('chatmessage')
        .where('chatmessage.roomCode = :roomCode', { roomCode })
        .orderBy('chatmessage.timestamp', 'DESC')
        .limit(50)
        .getMany();
      
      this.logger.log(`채팅 기록 조회 완료: ${messages.length}개 메시지`);
      
      return messages.reverse();
    } catch (error) {
      this.logger.error('채팅 기록 조회 실패', error.stack);
      throw error;
    }
  }
}