import { faker } from '@faker-js/faker';
import { Room } from '../entities/room.entity';
import * as bcrypt from 'bcrypt';

export const createRoomEntity = (options: Partial<Room> = {}): Room => {
  const room = new Room();

  // 기본값 설정
  room.id = options.id ?? 1;
  room.name = options.name ?? `${faker.lorem.words(2).substring(0, 45)}_${Date.now()}`;
  room.password = options.password ?? bcrypt.hashSync(faker.internet.password({ length: 20 }), 10);
  room.maxParticipants = options.maxParticipants ?? 2;
  room.createdAt = options.createdAt ?? new Date();
  room.updatedAt = options.updatedAt ?? new Date();
  room.deletedAt = options.deletedAt ?? null;

  return room;
};