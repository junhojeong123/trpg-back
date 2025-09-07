// src/chat/chat.service.spec.ts
import { ChatService } from '../chat.service';
import { Chatmessage } from '@/chat/entities/chat-message.entity';
import { ForbiddenException } from '@nestjs/common';

describe('ChatService (unit)', () => {
  let service: ChatService;
  let mockRepo: any;
  let mockDataSource: any;
  let mockUsersService: any;
  let mockRoomService: any;
  let mockRateLimitService: any;
  let mockDiceService: any;

  beforeEach(() => {
    // repository mock
    mockRepo = {
      create: jest.fn().mockImplementation((v) => v),
      save: jest.fn(),
      findAndCount: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue({
        delete: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 2 }),
      }),
    };

    // dataSource.transaction should call callback with a manager that has getRepository returning mockRepo
    mockDataSource = {
      transaction: jest.fn().mockImplementation(async (cb) => {
        const manager = {
          getRepository: () => mockRepo,
        };
        return await cb(manager);
      }),
    };

    mockUsersService = {
      getActiveUserById: jest.fn(),
    };

    // RoomService.validateRoomAndParticipant must exist (we rely on it)
    mockRoomService = {
      validateRoomAndParticipant: jest.fn(),
    };

    mockRateLimitService = {
      isAllowed: jest.fn().mockResolvedValue(true), // 기본적으로 true로 설정
    };

    mockDiceService = {
      parseAndRoll: jest.fn(),
    };

    // instantiate service (note: we pass mocks directly)
    service = new ChatService(
      mockRepo as any,
      mockDataSource as any,
      mockUsersService as any,
      mockRoomService as any,
      mockRateLimitService as any,
      mockDiceService as any,
    );
  });

  it('saveMessage: should validate room/user and save message via transaction', async () => {
    const payload = { roomId: 1, userId: 10, content: 'hello world' };

    // arrange: validation passes, user exists, repo.save returns saved entity
    mockRoomService.validateRoomAndParticipant.mockResolvedValue({ id: 1, participants: [{ id: 10 }] });
    mockUsersService.getActiveUserById.mockResolvedValue({ id: 10, nickname: 'nick10', name: 'User10' });
    mockRateLimitService.isAllowed.mockResolvedValue(true); // rate limit 허용

    const savedEntity: Chatmessage = {
      id: 123,
      roomCode: '1',
      userId: 10,
      nickname: 'nick10',
      content: 'hello world',
      createdAt: new Date(),
    };
    mockRepo.save.mockResolvedValue(savedEntity);

    // act
    const result = await service.saveMessage(payload);

    // assert
    expect(mockRoomService.validateRoomAndParticipant).toHaveBeenCalledWith(1, 10);
    expect(mockUsersService.getActiveUserById).toHaveBeenCalledWith(10);
    expect(mockRateLimitService.isAllowed).toHaveBeenCalledWith(10);
    expect(mockRepo.save).toHaveBeenCalled();
    expect(result).toEqual(savedEntity);
  });

  it('sendAndBroadcast: should call saveMessage then server.to(...).emit', async () => {
    const payload = { roomId: 2, userId: 20, content: 'hi' };
    const savedEntity: Chatmessage = {
      id: 55,
      roomCode: '2',
      userId: 20,
      nickname: 'nick20',
      content: 'hi',
      createdAt: new Date(),
    };

    // stub saveMessage to return savedEntity
    jest.spyOn(service, 'saveMessage').mockResolvedValue(savedEntity);

    // mock server
    const roomEmitter = { emit: jest.fn() };
    const fakeServer: any = { to: jest.fn().mockReturnValue(roomEmitter) };

    const result = await service.sendAndBroadcast(fakeServer, payload);

    expect(service.saveMessage).toHaveBeenCalledWith(payload);
    expect(fakeServer.to).toHaveBeenCalledWith('2'); // 문자열로 변경
    expect(roomEmitter.emit).toHaveBeenCalledWith('message', savedEntity);
    expect(result).toEqual(savedEntity);
  });

  it('handles dice command using diceService.parseAndRoll', async () => {
    const payload = { roomId: 3, userId: 30, content: '/roll 1d6' };
    mockRoomService.validateRoomAndParticipant.mockResolvedValue({ id: 3, participants: [{ id: 30 }] });
    mockUsersService.getActiveUserById.mockResolvedValue({ id: 30, nickname: 'diceGuy', name: 'Dice' });
    mockRateLimitService.isAllowed.mockResolvedValue(true); // rate limit 허용
    mockDiceService.parseAndRoll.mockResolvedValue({ text: 'rolled 4' });

    const savedEntity: Chatmessage = {
      id: 88,
      roomCode: '3',
      userId: 30,
      nickname: 'diceGuy',
      content: '[주사위] diceGuy: rolled 4',
      createdAt: new Date(),
    };
    mockRepo.save.mockResolvedValue(savedEntity);

    const res = await service.saveMessage(payload);
    expect(mockDiceService.parseAndRoll).toHaveBeenCalled();
    expect(res).toEqual(savedEntity);
  });

  it('getMessages returns paged result', async () => {
    const items = [
      { id: 1, content: 'a', roomCode: '1', userId: 1, nickname: 'u1', createdAt: new Date() },
      { id: 2, content: 'b', roomCode: '1', userId: 2, nickname: 'u2', createdAt: new Date() },
    ];
    mockRepo.findAndCount.mockResolvedValue([items, 2]);
    const res = await service.getMessages(1, 1, 10);
    expect(res.items).toBe(items);
    expect(res.total).toBe(2);
  });

  it('purgeMessagesForRoom deletes and returns affected count', async () => {
    // createQueryBuilder mock returns execute -> { affected: 2 }
    const affected = await service.purgeMessagesForRoom('R1');
    expect(affected).toBe(2); // our mock returns affected:2
  });

  it('should throw ForbiddenException when rate limit exceeded', async () => {
    const payload = { roomId: 1, userId: 10, content: 'hello world' };
    
    mockRateLimitService.isAllowed.mockResolvedValue(false); // rate limit 초과
    
    await expect(service.saveMessage(payload)).rejects.toThrow(ForbiddenException);
  });
});