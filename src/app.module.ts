import * as Joi from 'joi';
import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule } from '@nestjs/config';

// 기존 TRPG modules
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { DbModule } from './db/db.module';
import { AuthModule } from './auth/auth.module';
import { RoomModule } from './room/room.module';
import { CharacterModule } from './character/character.module';

// Chat module
import { ChatModule } from './chat/chat.module';

@Module({
  imports: [
    // 환경변수 전역 설정 (trpg_server 쪽 설정 유지)
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: `.env.${process.env.NODE_ENV}`,
      validationSchema: Joi.object({
        DATABASE_HOST: Joi.string().required(),
        DATABASE_PORT: Joi.number().required(),
        DATABASE_USER: Joi.string().required(),
        DATABASE_PASSWORD: Joi.string().required(),
        DATABASE_DBNAME: Joi.string().required(),
        DATABASE_SYNCHRONIZE: Joi.boolean().required(),
        DATABASE_DROP_SCHEMA: Joi.boolean().required(),
        DATABASE_LOGGING: Joi.boolean().required(),
        DATABASE_MIGRATIONS_RUN: Joi.boolean().required(),
        CACHE_TTL: Joi.number().default(3600),
      }),
    }),

    // 캐시 모듈: 전역으로 등록 (chat 모듈 등에서 공유 가능하도록)
    CacheModule.register({
      isGlobal: true,
      ttl: 60,
      max: 100,
    }),

    // 기존 TRPG 모듈들
    UsersModule,
    DbModule,
    AuthModule,
    RoomModule,
    CharacterModule,

    // Chat 모듈 (chat-main에서 가져온 것)
    ChatModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
