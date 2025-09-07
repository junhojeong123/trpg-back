// src/modules/chat/chat.gateway.ts
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { ChatService } from './chat.service';

@WebSocketGateway({
  cors: { origin: '*' },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(private readonly chatService: ChatService) {}

  async handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  async handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  /**
   * 메시지 전송 이벤트
   */
  @SubscribeMessage('sendMessage')
  async handleSendMessage(
    @MessageBody()
    data: { roomId: number; userId: number; content: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const saved = await this.chatService.sendAndBroadcast(this.server, data);
      return { status: 'ok', message: saved };
    } catch (error) {
      this.logger.error(`sendMessage failed: ${error.message}`);
      client.emit('error', { message: error.message });
      return { status: 'error', message: error.message };
    }
  }

  /**
   * 특정 방 입장
   */
  @SubscribeMessage('joinRoom')
  async handleJoinRoom(
    @MessageBody() data: { roomId: number; userId: number },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      await client.join(data.roomId.toString());
      this.logger.log(`User ${data.userId} joined room ${data.roomId}`);
      this.server.to(data.roomId.toString()).emit('system', {
        message: `User ${data.userId} entered the room.`,
      });
    } catch (err) {
      this.logger.error(`joinRoom failed: ${err.message}`);
      client.emit('error', { message: err.message });
    }
  }
}
