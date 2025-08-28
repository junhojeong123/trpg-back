import * as Joi from 'joi';
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { DbModule } from './db/db.module';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { RoomModule } from './room/room.module';
import { CharacterModule } from './character/character.module';

@Module({
  imports: [
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
    UsersModule,
    DbModule,
    AuthModule,
    RoomModule,
    CharacterModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
