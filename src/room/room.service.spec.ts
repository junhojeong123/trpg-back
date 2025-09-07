// src/room/room.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { RoomService } from './room.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Room } from './entities/room.entity';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { UsersService } from '@/users/users.service';
import * as bcrypt from 'bcrypt';

// bcrypt 모킹
jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

jest.mock('typeorm-transactional', () => ({
  Transactional: () => () => ({}),
}));

const roomRepository = {
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  createQueryBuilder: jest.fn().mockReturnValue({
    relation: jest.fn().mockReturnThis(),
    of: jest.fn().mockReturnThis(),
    add: jest.fn(),
  }),
};
const usersService = {
  getActiveUserById: jest.fn(),
};

describe('RoomService', () => {
  let service: RoomService;

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        RoomService,
        {
          provide: getRepositoryToken(Room),
          useValue: roomRepository,
        },
        {
          provide: UsersService,
          useValue: usersService,
        },
      ],
    }).compile();

    service = moduleRef.get<RoomService>(RoomService);
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createRoom', () => {
    const createRoomDto = { name: 'TestRoom', password: '1234', maxParticipants: 2 };
    const creatorId = 1;

    it('should create room successfully', async () => {
      const mockUser = { id: creatorId, createdRoom: null };
      const mockRoom = { id: 1, ...createRoomDto, creator: mockUser, participants: [mockUser] };

      usersService.getActiveUserById.mockResolvedValue(mockUser);
      roomRepository.findOne.mockResolvedValue(null);
      roomRepository.create.mockReturnValue(mockRoom);
      roomRepository.save.mockResolvedValue(mockRoom);

      const result = await service.createRoom(createRoomDto, creatorId);
      expect(result).toEqual(mockRoom);
    });

    it('should throw BadRequestException if user already has a room', async () => {
      const mockUser = { id: creatorId, createdRoom: { id: 999 } };
      usersService.getActiveUserById.mockResolvedValue(mockUser);

      await expect(service.createRoom(createRoomDto, creatorId))
        .rejects
        .toThrow(BadRequestException);
    });
  });

  describe('joinRoom', () => {
    const roomId = 1;
    const userId = 2;
    const password = '1234';

    it('should join room successfully', async () => {
      const mockUser = { id: userId };
      const hashedPassword = '$2b$10$E6stmA8CQr0v9JG5sQjxQekQmCO1uZueNyhWpcmG0OPhcNkx1VmMG';
      const mockRoom = {
        id: roomId,
        password: hashedPassword,
        participants: [],
      };

      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      usersService.getActiveUserById.mockResolvedValue(mockUser);
      roomRepository.findOne.mockResolvedValue(mockRoom);

      await service.joinRoom(roomId, userId, password);

      expect(roomRepository.createQueryBuilder).toHaveBeenCalled();
      expect(roomRepository.createQueryBuilder().relation).toHaveBeenCalledWith(Room, 'participants');
      expect(roomRepository.createQueryBuilder().of).toHaveBeenCalledWith(roomId);
      expect(roomRepository.createQueryBuilder().add).toHaveBeenCalledWith(userId);
      expect(bcrypt.compare).toHaveBeenCalledWith(password, hashedPassword);
    });
    
    it('should throw error when password is incorrect', async () => {
      const mockUser = { id: userId };
      const hashedPassword = '$2b$10$E6stmA8CQr0v9JG5sQjxQekQmCO1uZueNyhWpcmG0OPhcNkx1VmMG';
      const mockRoom = {
        id: roomId,
        password: hashedPassword,
        participants: [],
      };

      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      usersService.getActiveUserById.mockResolvedValue(mockUser);
      roomRepository.findOne.mockResolvedValue(mockRoom);

      await expect(service.joinRoom(roomId, userId, password))
        .rejects
        .toThrow();
    });
  });
  
  describe('getParticipants', () => {
    const roomId = 1;
    const mockUser1 = { id: 1, name: 'Alice', nickname: 'A' };
    const mockUser2 = { id: 2, name: 'Bob', nickname: 'B' };
    const mockRoom = {
      id: roomId,
      participants: [mockUser1, mockUser2],
    };

    it('should return participant list successfully', async () => {
      roomRepository.findOne.mockResolvedValue(mockRoom);

      const result = await service.getParticipants(roomId);

      expect(result).toEqual([
        { id: mockUser1.id, name: mockUser1.name, nickname: mockUser1.nickname },
        { id: mockUser2.id, name: mockUser2.name, nickname: mockUser2.nickname },
      ]);
      expect(roomRepository.findOne).toHaveBeenCalledWith({
        where: { id: roomId },
        relations: ['participants'],
      });
    });

    it('should throw NotFoundException if room does not exist', async () => {
      roomRepository.findOne.mockResolvedValue(null);

      await expect(service.getParticipants(roomId))
        .rejects
        .toThrow(NotFoundException);
    });
  });
});