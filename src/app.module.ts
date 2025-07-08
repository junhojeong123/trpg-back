import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { chatmessage } from './chat/entities/chat-message.entity'; 
import { ChatModule } from './chat/chat.module';

@Module({
  imports: [
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
