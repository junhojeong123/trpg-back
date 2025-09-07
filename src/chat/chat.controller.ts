
import { Controller, Get, Param, Query, ParseIntPipe } from '@nestjs/common';
import { ChatService } from './chat.service';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  // GET /chat/:roomId/messages?page=1&perPage=50
  @Get(':roomId/messages')
  async getRoomMessages(
    @Param('roomId') roomIdParam: string,
    @Query('page') pageParam?: string,
    @Query('perPage') perPageParam?: string,
  ) {
    const roomId = Number(roomIdParam);
    if (Number.isNaN(roomId)) throw new Error('roomId는 숫자여야 합니다');

    const page = pageParam ? Math.max(Number(pageParam), 1) : 1;
    const perPage = perPageParam ? Math.max(Number(perPageParam), 1) : 50;

    // getMessages는 { items, total, page, perPage }를 반환합니다
    const result = await this.chatService.getMessages(roomId, page, perPage);
    // 페이징된 결과를 반환 (클라이언트는 Chatmessage[]가 아닌 객체를 기대합니다)
    return result;
  }
}