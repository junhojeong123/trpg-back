// src/chat/chat.gateway.spec.ts
import { ChatGateway } from '../chat.gateway';
import { ChatService } from '../chat.service';

describe('ChatGateway (unit)', () => {
  let gateway: ChatGateway;
  let mockChatService: Partial<ChatService>;
  let mockServer: any;

  beforeEach(() => {
    mockChatService = {
      sendAndBroadcast: jest.fn(),
    } as any;

    gateway = new ChatGateway(mockChatService as any);

    mockServer = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn()
    };
    (gateway as any).server = mockServer;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('handleSendMessage calls chatService.sendAndBroadcast and emits result to client', async () => {
    const saved = { id: 101, content: 'ok' };
    (mockChatService.sendAndBroadcast as jest.Mock).mockResolvedValue(saved);

    const client = { 
      emit: jest.fn(), 
      data: { user: { id: 10 } } 
    } as any;
    const payload = { roomId: 5, content: 'hello', userId: 10 };

    await gateway.handleSendMessage(client as any, payload as any);

    // 호출이 이루어졌는지 확인
    expect(mockChatService.sendAndBroadcast).toHaveBeenCalled();
    
    // 클라이언트 emit 호출 확인
    expect(client.emit).toHaveBeenCalled();
  });
});