// src/modules/chat/chat.service.ts
import { Injectable, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as dompurify from 'dompurify';
import { JSDOM } from 'jsdom';
import { plainToClass } from 'class-transformer';
import { validate } from 'class-validator';
import { JoinRoomDto } from './dto/join-room.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { DiceService } from '../dice/dice.service';
import { RateLimitService } from './rate-limit.service';
import { Chatmessage } from './entities/chat-message.entity';

// --- DOMPurify 초기화 (Node 환경에서 안전하게) ---
const windowForDOMPurify = new JSDOM('').window as unknown as any;
const createDOMPurify = (dompurify as any).default ?? dompurify;
const DOMPurify: any = createDOMPurify(windowForDOMPurify);

// 설정 상수 - 환경변수로 관리하는 것이 좋음
const MAX_MESSAGE_LENGTH = 200;
const RATE_LIMIT_WINDOW_MS = 60000;
const DEFAULT_MESSAGE_LIMIT = 50;
const MAX_MESSAGE_LIMIT = 200;

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly diceService: DiceService,
    private readonly rateLimitService: RateLimitService,
    @InjectRepository(Chatmessage)
    private readonly chatMessageRepo: Repository<Chatmessage>,
  ) {}

  /**
   * 방 입장 처리 (비즈니스 로직만)
   */
  async joinRoom(userId: string, roomCode: string, currentRoomCode?: string): Promise<{ success: boolean; message?: string }> {
    try {
      if (!roomCode) {
        throw new BadRequestException('roomCode가 필요합니다');
      }

      // 여기서는 비즈니스 로직만 처리
      // 실제 Socket join/leave는 Gateway에서 처리
      
      this.logger.log(`사용자 ${userId}가 방 ${roomCode}에 입장`);
      return { success: true };
    } catch (error) {
      this.logger.error('방 참여 오류', error?.stack ?? error);
      throw error;
    }
  }

  /**
   * 방 퇴장 처리 (비즈니스 로직만)
   */
  async leaveRoom(userId: string, roomCode?: string): Promise<{ success: boolean; message?: string }> {
    try {
      if (!roomCode) {
        throw new BadRequestException('퇴장할 방이 없습니다');
      }

      // 비즈니스 로직만 처리
      this.logger.log(`사용자 ${userId}가 방 ${roomCode}에서 퇴장`);
      return { success: true };
    } catch (error) {
      this.logger.error('방 퇴장 오류', error?.stack ?? error);
      throw error;
    }
  }

  /**
   * 메시지 전송 처리 (비즈니스 로직만)
   */
  async sendMessage(dto: SendMessageDto, userId: string, nickname: string, roomCode: string): Promise<Chatmessage> {
    try {
      const trimmedMessage = String(dto.message ?? '').trim();
      if (!trimmedMessage) {
        throw new BadRequestException('메시지 내용이 비어 있습니다');
      }

      // XSS 방지
      const cleanMessage = this.sanitizeMessage(trimmedMessage);

      if (cleanMessage.length > MAX_MESSAGE_LENGTH) {
        throw new BadRequestException(`메시지는 최대 ${MAX_MESSAGE_LENGTH}자까지 가능합니다`);
      }

      // 주사위 명령어 처리
      if (cleanMessage.startsWith('/roll')) {
        const diceCommand = cleanMessage.replace(/^\/roll\s+/, '').trim();
        const result = this.diceService.rollCommand(diceCommand);
        
        const diceMessage = {
          senderId: 'System',
          nickname: '주사위',
          message: `${nickname ?? '익명'}의 주사위 결과: ${result.total} (${result.detail})`,
          roomCode,
        };
        
        return this.saveMessage(diceMessage);
      }

      // 일반 메시지 저장
      const payload = {
        senderId: String(userId), // string으로 변환
        nickname: nickname ?? `user${userId}`,
        message: cleanMessage,
        roomCode: dto.roomCode,
      };

      return await this.saveMessage(payload);
    } catch (error) {
      this.logger.error('메시지 처리 오류', error?.stack ?? error);
      throw error;
    }
  }

  /**
   * 채팅 기록 조회
   */
  async getMessages(roomCode: string, limit: number = DEFAULT_MESSAGE_LIMIT): Promise<Chatmessage[]> {
    try {
      if (!roomCode) {
        throw new BadRequestException('roomCode가 필요합니다');
      }

      // 안전 장치: limit 범위 강제
      const safeLimit = Math.min(Math.max(Number(limit) || DEFAULT_MESSAGE_LIMIT, 1), MAX_MESSAGE_LIMIT);

      const messages = await this.chatMessageRepo
        .createQueryBuilder('chatmessage')
        .where('chatmessage.roomCode = :roomCode', { roomCode })
        .orderBy('chatmessage.timestamp', 'DESC')
        .take(safeLimit)
        .getMany();

      this.logger.log(`채팅 기록 조회 완료: ${messages.length}개 메시지 (limit=${safeLimit})`);
      return messages.reverse();
    } catch (error) {
      this.logger.error('채팅 기록 조회 실패', error?.stack ?? error);
      throw new InternalServerErrorException('채팅 기록 조회에 실패했습니다');
    }
  }

  /**
   * 메시지 DB 저장
   */
  async saveMessage(payload: {
    senderId: string;
    nickname: string;
    message: string;
    roomCode: string;
    timestamp?: Date;
  }): Promise<Chatmessage> {
    try {
      const chatMessage = this.chatMessageRepo.create({
        roomCode: payload.roomCode,
        senderId: payload.senderId,
        nickname: payload.nickname,
        message: payload.message,
        timestamp: payload.timestamp ?? new Date(),
      });

      const savedMessage = await this.chatMessageRepo.save(chatMessage);
      this.logger.log(`메시지 저장 완료: ${savedMessage.id}`);
      return savedMessage;
    } catch (error) {
      this.logger.error('메시지 저장 실패', error?.stack ?? error);
      throw new InternalServerErrorException('메시지 저장에 실패했습니다');
    }
  }

  /**
   * XSS 방지 메시지 정제
   */
  private sanitizeMessage(message: string): string {
    return DOMPurify.sanitize(message, {
      ALLOWED_TAGS: [],
      ALLOWED_ATTR: [],
    });
  }

  /**
   * 방의 모든 메시지 삭제 (관리자용)
   */
  async clearRoomMessages(roomCode: string): Promise<number> {
    try {
      const result = await this.chatMessageRepo
        .createQueryBuilder()
        .delete()
        .from(Chatmessage)
        .where('roomCode = :roomCode', { roomCode })
        .execute();

      this.logger.log(`방 ${roomCode}의 메시지 ${result.affected}개 삭제 완료`);
      return result.affected || 0;
    } catch (error) {
      this.logger.error('메시지 삭제 실패', error?.stack ?? error);
      throw new InternalServerErrorException('메시지 삭제에 실패했습니다');
    }
  }
}