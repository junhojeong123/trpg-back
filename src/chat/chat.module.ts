import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatGateway } from './chat.gateway';
import { Chatmessage } from './entities/chat-message.entity';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { RateLimitService } from './rate-limit.service';
import { DiceService } from 'src/dice/dice.service';
@Module({
  imports: [
    TypeOrmModule.forFeature([Chatmessage]),
  ],
  providers: [ChatGateway, ChatService, RateLimitService, DiceService],
  controllers: [ChatController],
  exports: [ChatService, RateLimitService, DiceService],
})
export class ChatModule {}