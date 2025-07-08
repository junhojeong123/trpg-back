
import { Controller, Get, Query, NotFoundException } from '@nestjs/common';
import { ChatService } from './chat.service';
import { chatmessage } from './entities/chat-message.entity';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('logs')
  async getChatLogsByRoom(
    @Query('roomCode') roomCode: string,
  ): Promise<chatmessage[]> {
    if (!roomCode) {
      throw new NotFoundException('방 코드가 필요합니다.');
    }

    const messages = await this.chatService.getMessages(roomCode);

    if (!messages || messages.length === 0) {
      throw new NotFoundException(`방 ${roomCode}에 채팅 기록이 없습니다.`);
    }

    return messages;
  }
}