import { Test, TestingModule } from '@nestjs/testing';
import { ChatService } from '../chat.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Chatmessage } from '../entities/chat-message.entity';
import { DiceService } from '../../dice/dice.service';
import { RateLimitService } from '../rate-limit.service';
import { Repository } from 'typeorm';

describe('ChatService', () => {
  let service: ChatService;
  let repo: Repository<Chatmessage>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        DiceService,
        RateLimitService,
        {
          provide: getRepositoryToken(Chatmessage),
          useClass: Repository, // 실제 DB 대신 mock repository
        },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);
    repo = module.get<Repository<Chatmessage>>(getRepositoryToken(Chatmessage));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('saveMessage', () => {
    it('should save a message', async () => {
      const payload = {
        roomCode: 'room1',
        senderId: 'user1',
        nickname: 'tester',
        message: 'hello',
        timestamp: new Date(),
      };

      jest.spyOn(repo, 'create').mockReturnValue(payload as any);
      jest.spyOn(repo, 'save').mockResolvedValue({ id: 1, ...payload } as any);

      const result = await service.saveMessage(payload);
      expect(result).toHaveProperty('id');
      expect(result.message).toBe('hello');
    });
  });
});
