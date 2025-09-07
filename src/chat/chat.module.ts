import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { Chatmessage } from '@/chat/entities/chat-message.entity';
import { RoomModule } from '@/room/room.module';
import { UsersModule } from '@/users/users.module'; // ✅ 추가
import { RateLimitService } from './rate-limit.service';
import { DiceService } from '@/dice/dice.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Chatmessage]),
    RoomModule,
    UsersModule, // ✅ UsersModule 불러오기
  ],
  providers: [ChatService, ChatGateway, RateLimitService, DiceService],
  exports: [ChatService],
})
export class ChatModule {}
