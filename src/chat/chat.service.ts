import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { chatmessage } from './entities/chat-message.entity';
import { Repository } from 'typeorm';

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(chatmessage)
    private chatRepo: Repository<chatmessage>,
  ) {}

  async saveMessage(data: {
    roomCode: string;
    senderId: string;
    nickname: string;
    message: string;
  }) {
    const newMsg = this.chatRepo.create(data);
    return this.chatRepo.save(newMsg);
  }

  async getMessages(roomCode: string) {
    return this.chatRepo.find({
      where: { roomCode },
      order: { timestamp: 'ASC' },
    });
  }
}
