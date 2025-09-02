// src/modules/chat/chat.controller.ts
import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { ChatService } from './chat.service';
import { Chatmessage } from './entities/chat-message.entity';
import { GetChatLogsDto } from './dto/get-chat-logs.dto';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  
  @Get('logs')
  async getChatLogsByRoom(
    @Query() query: GetChatLogsDto,
  ): Promise<Chatmessage[]> {
    const { roomCode, limit = 50 } = query;

    if (!roomCode) {
      throw new BadRequestException('roomCode 쿼리 파라미터가 필요합니다.');
    }

    // ChatService에서 limit 적용
    const messages = await this.chatService.getMessages(roomCode, limit);

    // 채팅이 없어도 200 OK + [] 반환
    return messages ?? [];
  }
}
