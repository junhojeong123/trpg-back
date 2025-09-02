// src/modules/chat/chat.gateway.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { ChatGateway } from '../chat.gateway';
import { ChatService } from '../chat.service';
import { Server, Socket } from 'socket.io';

describe('ChatGateway', () => {
  let gateway: ChatGateway;
  let chatService: ChatService;
  let mockServer: Server;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatGateway,
        {
          provide: ChatService,
          useValue: {
            joinRoom: jest.fn(),
            leaveRoom: jest.fn(),
            sendMessage: jest.fn(),
            getMessages: jest.fn(),
          },
        },
      ],
    }).compile();

    gateway = module.get<ChatGateway>(ChatGateway);
    chatService = module.get<ChatService>(ChatService);
    
    // Mock server 설정
    mockServer = { 
      emit: jest.fn(),
      to: jest.fn().mockReturnThis(),
    } as any;
    gateway['server'] = mockServer;
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  describe('handleConnection', () => {
    it('should handle new connection', () => {
      const mockClient = {
        id: 'socket-123',
        handshake: { auth: { userId: 'user1', nickname: 'testuser' } },
        emit: jest.fn(),
      } as any;

      gateway.handleConnection(mockClient);
      
      expect(mockClient.emit).toHaveBeenCalledWith('chat:system', expect.objectContaining({
        message: '서버에 연결되었습니다.',
      }));
    });

    it('should disconnect if no auth data', () => {
      const mockClient = {
        id: 'socket-123',
        handshake: { auth: {} },
        emit: jest.fn(),
        disconnect: jest.fn(),
      } as any;

      gateway.handleConnection(mockClient);
      
      expect(mockClient.emit).toHaveBeenCalledWith('chat:error', expect.objectContaining({
        code: 'UNAUTHORIZED',
      }));
      expect(mockClient.disconnect).toHaveBeenCalled();
    });
  });

  describe('handleJoinRoom', () => {
    it('should handle join room event', async () => {
      const mockClient = {
        id: 'socket-123',
        emit: jest.fn(),
        join: jest.fn(),
        to: jest.fn().mockReturnThis(),
        handshake: { auth: { userId: 'user1', nickname: 'testuser' } },
      } as any;

      const joinRoomDto = { roomCode: 'room1' };
      
      // 클라이언트 데이터 설정
      (gateway as any).clients.set('socket-123', { 
        userId: 'user1', 
        nickname: 'testuser' 
      });

      (chatService.joinRoom as jest.Mock).mockResolvedValue({ success: true });

      await gateway.handleJoinRoom(mockClient, joinRoomDto);
      
      expect(chatService.joinRoom).toHaveBeenCalledWith('user1', 'room1', undefined);
      expect(mockClient.join).toHaveBeenCalledWith('room1');
      expect(mockClient.emit).toHaveBeenCalledWith('chat:joinedRoom', { roomCode: 'room1' });
    });

    it('should emit error if client not authenticated', async () => {
      const mockClient = {
        id: 'socket-123',
        emit: jest.fn(),
      } as any;

      const joinRoomDto = { roomCode: 'room1' };

      await gateway.handleJoinRoom(mockClient, joinRoomDto);
      
      expect(mockClient.emit).toHaveBeenCalledWith('chat:error', expect.objectContaining({
        code: 'UNAUTHORIZED',
      }));
    });
  });

  describe('handleMessage', () => {
    it('should handle send message event', async () => {
      const mockClient = {
        id: 'socket-123',
        emit: jest.fn(),
        to: jest.fn().mockReturnThis(),
        handshake: { auth: { userId: 'user1', nickname: 'testuser' } },
      } as any;

      const sendMessageDto = { roomCode: 'room1', message: 'Hello World' };
      const mockSavedMessage = {
        id: 1,
        senderId: 'user1',
        nickname: 'testuser',
        message: 'Hello World',
        roomCode: 'room1',
        timestamp: new Date(),
      };

      // 클라이언트 데이터 설정
      (gateway as any).clients.set('socket-123', { 
        userId: 'user1', 
        nickname: 'testuser',
        roomCode: 'room1'
      });

      (chatService.sendMessage as jest.Mock).mockResolvedValue(mockSavedMessage);

      await gateway.handleMessage(mockClient, sendMessageDto);
      
      expect(chatService.sendMessage).toHaveBeenCalledWith(
        sendMessageDto,
        'user1',
        'testuser',
        'room1'
      );
      expect(mockServer.to).toHaveBeenCalledWith('room1');
    });

    it('should emit error if client not in room', async () => {
      const mockClient = {
        id: 'socket-123',
        emit: jest.fn(),
        handshake: { auth: { userId: 'user1', nickname: 'testuser' } },
      } as any;

      const sendMessageDto = { roomCode: 'room1', message: 'Hello World' };

      // 클라이언트 데이터 설정 (방에 참여하지 않음)
      (gateway as any).clients.set('socket-123', { 
        userId: 'user1', 
        nickname: 'testuser'
      });

      await gateway.handleMessage(mockClient, sendMessageDto);
      
      expect(mockClient.emit).toHaveBeenCalledWith('chat:error', expect.objectContaining({
        code: 'INVALID_ROOM',
      }));
    });
  });

  describe('handleGetChatLogs', () => {
    it('should handle get chat logs event', async () => {
      const mockClient = {
        id: 'socket-123',
        emit: jest.fn(),
        handshake: { auth: { userId: 'user1', nickname: 'testuser' } },
      } as any;

      const mockLogs = [{ id: 1, message: 'test message' }];
      
      // 클라이언트 데이터 설정
      (gateway as any).clients.set('socket-123', { 
        userId: 'user1', 
        nickname: 'testuser',
        roomCode: 'room1'
      });

      (chatService.getMessages as jest.Mock).mockResolvedValue(mockLogs);

      await gateway.handleGetChatLogs(mockClient, { roomCode: 'room1' });
      
      expect(chatService.getMessages).toHaveBeenCalledWith('room1', undefined);
      expect(mockClient.emit).toHaveBeenCalledWith('chat:chatLogs', mockLogs);
    });
  });
});