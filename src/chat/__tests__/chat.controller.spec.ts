import { Test, TestingModule } from '@nestjs/testing';
import { ChatController } from '../chat.controller';
import { ChatService } from '../chat.service';
import { GetChatLogsDto } from '../dto/get-chat-logs.dto';

describe('ChatController', () => {
  let controller: ChatController;
  let chatService: ChatService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChatController],
      providers: [
        {
          provide: ChatService,
          useValue: {
            getMessages: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<ChatController>(ChatController);
    chatService = module.get<ChatService>(ChatService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return chat logs', async () => {
    const mockLogs = [{ id: 1, message: 'hi' }];
    (chatService.getMessages as jest.Mock).mockResolvedValue(mockLogs);

    // GetChatLogsDto 타입에 맞게 객체로 전달
    const query: GetChatLogsDto = { roomCode: 'room1', limit: 50 };
    const result = await controller.getChatLogsByRoom(query);
    expect(result).toEqual(mockLogs);
  });
});