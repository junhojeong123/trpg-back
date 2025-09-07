
import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
  ForbiddenException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as dompurify from 'dompurify';
import { JSDOM } from 'jsdom';
import { Server } from 'socket.io';
import { Chatmessage } from '@/chat/entities/chat-message.entity';
import { UsersService } from '@/users/users.service';
import { RoomService } from '@/room/room.service';
import { RateLimitService } from './rate-limit.service';
import { DiceService } from '../dice/dice.service';

// DOMPurify Node.js 환경 설정
const windowForDOMPurify = new JSDOM('').window as unknown as any;
const DOMPurify = (dompurify as any)(windowForDOMPurify);

// TypeScript가 선택적 메서드가 존재함을 알 수 있도록 경량 인터페이스 정의
interface IRateLimitService {
  isAllowed?(userId: number | string): Promise<boolean>;
}
interface IDiceService {
  parseAndRoll?(cmd: string, ctx?: any): Promise<any>;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    @InjectRepository(Chatmessage)
    private readonly chatMessageRepo: Repository<Chatmessage>,
    private readonly dataSource: DataSource,
    private readonly usersService: UsersService,
    private readonly roomService: RoomService,
    // 선택적 주입: 제공자가 없어도 Nest가 실패하지 않도록 @Optional() 사용
    @Optional() private readonly rateLimitService?: IRateLimitService,
    @Optional() private readonly diceService?: IDiceService,
  ) {}

  /**
   * 유효성 검사를 거친 후 메시지 저장
   * roomId, userId는 숫자 타입입니다.
   */
  async saveMessage(payload: {
    roomId: number;
    userId: number;
    content: string;
    meta?: Record<string, any>;
  }): Promise<Chatmessage> {
    const { roomId, userId } = payload;
    let { content } = payload;

    if (!roomId || !userId) {
      throw new BadRequestException('roomId와 userId는 필수입니다');
    }

    // RoomService의 공개 검증기를 사용하여 방 존재 여부와 사용자 참여 여부 확인
    await this.roomService.validateRoomAndParticipant(roomId, userId);

    // 사용자 존재 여부 확인
    const user = await this.usersService.getActiveUserById(userId);
    if (!user) {
      throw new ForbiddenException('잘못된 사용자입니다');
    }

    // 속도 제한 체크 (서비스가 제공된 경우에만)
    if (this.rateLimitService && typeof this.rateLimitService.isAllowed === 'function') {
      const allowed = await this.rateLimitService.isAllowed(userId);
      if (!allowed) {
        throw new ForbiddenException('속도 제한을 초과했습니다');
      }
    }

    // 주사위 명령어 지원 (선택적)
    if (this.diceService && typeof this.diceService.parseAndRoll === 'function') {
      const trimmed = content?.trim();
      if (trimmed?.startsWith('/roll') || trimmed?.startsWith('/r')) {
        try {
          const cmd = trimmed.replace(/^\/(roll|r)\s*/i, '');
          const res = await this.diceService.parseAndRoll(cmd, { userId, user });
          content = `[주사위] ${user.nickname ?? user.name ?? userId}: ${res.text ?? JSON.stringify(res)}`;
        } catch (e) {
          content = `[주사위 실패] ${e?.message ?? '파싱 실패'}`;
        }
      }
    }

    // 내용 정화 (XSS 방지)
    const sanitized = DOMPurify.sanitize(content ?? '');

    // 트랜잭션으로 영속화 - <Chatmessage> 제네릭으로 반환 타입 확정
    try {
      const saved = await this.dataSource.transaction<Chatmessage>(async (manager) => {
        const repo = manager.getRepository(Chatmessage);
        const entity = repo.create({
          roomCode: String(roomId),
          userId,
          nickname: user.nickname ?? user.name ?? 'Unknown',
          content: sanitized,
        } as Partial<Chatmessage>);
        return await repo.save(entity);
      });

      // 이제 saved는 Chatmessage 타입으로 확정되어 saved.id 접근에 문제가 없습니다.
      this.logger.debug(`방 ${roomId}에 메시지 ${saved.id} 저장 완료`);
      return saved;
    } catch (error) {
      this.logger.error('메시지 저장 실패', error?.stack ?? error);
      throw new InternalServerErrorException('메시지 저장에 실패했습니다');
    }
  }

  // 저장 및 브로드캐스트
  async sendAndBroadcast(server: Server, payload: {
    roomId: number;
    userId: number;
    content: string;
    meta?: Record<string, any>;
  }): Promise<Chatmessage> {
    const saved = await this.saveMessage(payload);

    try {
      server.to(String(payload.roomId)).emit('message', saved);
      return saved;
    } catch (err) {
      this.logger.error('저장 후 브로드캐스트 실패', err?.stack ?? err);
      return saved;
    }
  }

  // 메시지 조회 (페이징된 결과 반환)
  async getMessages(roomId: number, page = 1, perPage = 50) {
    if (!roomId) throw new BadRequestException('roomId는 필수입니다');
    const skip = (Math.max(page, 1) - 1) * perPage;
    try {
      const [items, total] = await this.chatMessageRepo.findAndCount({
        where: { roomCode: String(roomId) },
        order: { createdAt: 'ASC' as const },
        skip,
        take: perPage,
      });
      return { items, total, page, perPage };
    } catch (err) {
      this.logger.error('메시지 조회 실패', err?.stack ?? err);
      throw new InternalServerErrorException('메시지 조회에 실패했습니다');
    }
  }

  // 메시지 삭제
  async purgeMessagesForRoom(roomCode: string) {
    try {
      const result = await this.chatMessageRepo
        .createQueryBuilder()
        .delete()
        .from(Chatmessage)
        .where('roomCode = :roomCode', { roomCode })
        .execute();
      return result.affected ?? 0;
    } catch (err) {
      this.logger.error('메시지 삭제 실패', err?.stack ?? err);
      throw new InternalServerErrorException('메시지 삭제에 실패했습니다');
    }
  }
}