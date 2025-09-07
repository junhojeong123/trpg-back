import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('chat_messages')
export class Chatmessage {
  @PrimaryGeneratedColumn()
  id: number;

  // 방 코드: Room.id를 문자열로 사용하거나 고유 코드 사용시 string
  @Column({ type: 'varchar', length: 50, name: 'room_code' })
  roomCode: string;

  // User.id와 매칭되는 정수형 FK
  @Column({ type: 'int', name: 'user_id' })
  userId: number;

  // 채팅 중 표시할 닉네임
  @Column({ type: 'varchar', length: 100 })
  nickname: string;

  // 메시지 본문 (긴 텍스트)
  @Column({ type: 'text' })
  content: string;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}
