import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CreateRoomDto } from './dto/create-room.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Room } from './entities/room.entity';
import { User } from '@/users/entities/user.entity';
import * as bcrypt from 'bcrypt';
import { Logger } from '@nestjs/common';
import { UsersService } from '@/users/users.service';
import { Transactional } from 'typeorm-transactional';
import { RoomParticipantDto } from './dto/room-participant.dto';

@Injectable()
export class RoomService {
  private readonly logger = new Logger(RoomService.name);

  constructor(
    @InjectRepository(Room)
    private readonly roomRepository: Repository<Room>,
    private readonly usersService: UsersService,
  ) { }

  // 방 생성
  @Transactional()
  async createRoom(dto: CreateRoomDto, creatorId: number): Promise<Room> {
    this.logger.log(`[CREATE_ROOM] 방 생성 요청: ${dto.name}`);

    try {
      const user = await this.usersService.getActiveUserById(creatorId);

      // 이미 방을 생성한 경우
      if (user.createdRoom) {
        throw new BadRequestException('이미 방을 생성했습니다.');
      }

      const hashedPassword = await bcrypt.hash(dto.password, 10);

      const room = this.roomRepository.create({
        name: dto.name,
        password: hashedPassword,
        maxParticipants: dto.maxParticipants,
        creator: user,
        participants: [user],
      });
      const existingRoom = await this.roomRepository.findOne({ where: { name: dto.name } });
      if (existingRoom) throw new BadRequestException('이미 존재하는 방 이름입니다.');

      const savedRoom = await this.roomRepository.save(room);
      this.logger.log(`[CREATE_ROOM] 방 생성 성공: ${savedRoom.id}`);
      return savedRoom;
    } catch (error) {
      this.logger.error(`[CREATE_ROOM] 방 생성 실패: ${error.message}`);
      if (error instanceof BadRequestException) throw error;
      throw new InternalServerErrorException(`Room creation failed: ${error.message}`);
    }
  }

  // 방 참가
  @Transactional()
  async joinRoom(
    roomId: number,
    userId: number,
    password?: string,
  ): Promise<void> {
    this.logger.log(`[JOIN_ROOM] 방 ID: ${roomId}, 사용자 ID: ${userId} 참여 시도`);

    try {
      // 1. 방 조회
      const room = await this.roomRepository.findOne({
        where: { id: roomId },
        relations: ['participants'],
        lock: { mode: 'pessimistic_write' } // 동시성 제어
      });

      if (!room) {
        this.logger.warn(`[JOIN_ROOM] 방을 찾을 수 없음: ${roomId}`);
        throw new NotFoundException('방을 찾을 수 없습니다.');
      }

      // 2. 비밀번호 검증
      await this.validatePassword(room, password);

      // 3. 인원 제한 검사
      await this.checkParticipantLimit(room);

      // 4. 삭제되지 않은 사용자인지 확인
      const user = await this.usersService.getActiveUserById(userId);

      // 5. 방 참가 처리
      await this.addParticipant(room, user);
    } catch (error) {
      this.logger.error(`[JOIN_ROOM] 방 참가 실패: ${error.message}`);
      throw error;
    }
  }

  // 비밀번호 검증 (단순히 일치 여부만 체크)
  private async validatePassword(room: Room, password?: string): Promise<void> {
    if (!room.password) return;

    if (!password) {
      this.logger.warn(`[VALIDATE_PASSWORD] 비밀번호 미입력: ${room.id}`);
      throw new BadRequestException('비밀번호를 입력해주세요.');
    }

    const isValid = await bcrypt.compare(password, room.password);
    if (!isValid) {
      this.logger.warn(`[VALIDATE_PASSWORD] 비밀번호 일치하지 않음: ${room.id}`);
      throw new BadRequestException('비밀번호가 일치하지 않습니다.');
    }

    this.logger.log(`[VALIDATE_PASSWORD] 비밀번호 검증 성공: ${room.id}`);
  }

  // 방 인원수 제한 확인
  private async checkParticipantLimit(room: Room): Promise<void> {
    if (room.participants.length >= room.maxParticipants) {
      this.logger.warn(`[CHECK_PARTICIPANT_LIMIT] 방이 꽉 참: ${room.id}`);
      throw new BadRequestException('방이 꽉 찼습니다.');
    }
  }

  // 참가자 추가
  private async addParticipant(room: Room, user: User): Promise<void> {
    const isAlreadyParticipant = room.participants.some((p) => p.id === user.id);
    if (!isAlreadyParticipant) {
      room.participants.push(user);
      await this.roomRepository
        .createQueryBuilder()
        .relation(Room, 'participants')
        .of(room.id)
        .add(user.id);
      this.logger.log(`[ADD_PARTICIPANT] 사용자 추가됨: ${user.id}, 방 ID: ${room.id}`);
    }
  }

  // 방 참여자 목록 조회
  async getParticipants(roomId: number): Promise<RoomParticipantDto[]> {
    const room = await this.roomRepository.findOne({
      where: { id: roomId },
      relations: ['participants'],
    });
    if (!room) throw new NotFoundException('방을 찾을 수 없습니다.');

    // User 엔티티 → RoomParticipantDto 변환
    return room.participants.map(p => ({
      id: p.id,
      name: p.name,
      nickname: p.nickname
    }));
  }
}