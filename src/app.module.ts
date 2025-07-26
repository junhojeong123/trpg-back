import {  Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { TypeOrmModule } from '@nestjs/typeorm';
import { chatmessage } from './chat/entities/chat-message.entity'; 
import { ChatModule } from './chat/chat.module';

@Module({
  imports: [
    // ✅ 1. isGlobal: true 필수 (이게 빠지면 오류 발생)
    // ✅ 2. register() 사용 (forRoot X)
    CacheModule.register({
      isGlobal: true, // ⚠️ 이 옵션이 핵심! 없으면 ChatModule에서 접근 불가
      ttl: 60,        // 초 단위
      max: 100,
    }),
    ChatModule,
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: 'localhost',
      port: 5432,
      username: 'postgres',
      password: '1234',
      database: 'chat_app',
      entities: [chatmessage],
      synchronize: true, // dev 전용
    }),
    ChatModule,
  ],
})
export class AppModule {}
