// src/room/room.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Room } from './entities/room.entity';
import { RoomService } from './room.service';
import { UsersModule } from '../users/users.module'; // <-- 추가

@Module({
  imports: [
    TypeOrmModule.forFeature([Room]),
    UsersModule, // UsersService를 사용하기 위해 UsersModule을 import
  ],
  providers: [RoomService],
  exports: [RoomService],
})
export class RoomModule {}
