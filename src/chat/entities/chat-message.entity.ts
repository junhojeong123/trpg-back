import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity('chatmessage') 
export class chatmessage { 
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 50 }) // 방 코드 길이 제한
  roomCode: string;

  @Column({ type: 'varchar', length: 50 }) // 사용자 ID
  senderId: string;

  @Column({ type: 'varchar', length: 50 }) // 닉네임
  nickname: string;

  @Column({ type: 'text' }) // 긴 메시지 저장
  message: string;

  @CreateDateColumn({ 
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP', // DB 기본값 설정
  })
  timestamp: Date;
}