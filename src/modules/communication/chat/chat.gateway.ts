import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import { CreateMessageDto } from '../dto/create-message.dto';
import { UseGuards } from '@nestjs/common';
import { UserRepositoryService } from '../../user/user.repository.service';
import { WsJwtGuard } from './ws-jwt.guard';
import { AuthenticatedSocket } from '../interface/chat.interface';
import { CommunicationRepositoryService } from '../communication.repository.service';
import { JwtService } from '../../../common/services/jwt.service';
import { Types } from 'mongoose';

@WebSocketGateway({ cors: true })
@UseGuards(WsJwtGuard)
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly userRepoService: UserRepositoryService,
    private readonly communicationRepoService: CommunicationRepositoryService,
    private readonly jwtService: JwtService,
  ) {}

  async handleDisconnect(client: AuthenticatedSocket) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const payload: { id: string } | null = await this.jwtService.verify(
        client?.handshake?.query?.token as string,
      );

      if (payload?.id && Types.ObjectId.isValid(payload.id)) {
        await this.userRepoService.updateUserConnectionId(null, payload.id);
        client.emit('disconnected', {
          message: 'Disconnected successfully',
          userId: payload?.id,
          socketId: client.id,
        });
      }
    } catch {
      client.emit('error', {
        message: 'Token expired',
      });
    }
  }

  async handleConnection(client: AuthenticatedSocket) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const payload: { id: string } | null = await this.jwtService.verify(
        client?.handshake?.query?.token as string,
      );

      if (payload?.id && Types.ObjectId.isValid(payload.id)) {
        await this.userRepoService.updateUserConnectionId(
          client.id,
          payload.id,
        );
        client.emit('connected', {
          message: 'Connected successfully',
          userId: payload.id,
          socketId: client.id,
        });
      }
    } catch {
      client.emit('error', {
        message: 'Token expired',
      });
    }
  }

  @SubscribeMessage('send_message')
  async handleMessage(client: AuthenticatedSocket, payload: CreateMessageDto) {
    const { productServiceId, roomId, chatContext, message } = payload;

    // Update message in db with some change in query
    await Promise.all([
      this.communicationRepoService.createCommunicationRoom(),
      this.communicationRepoService.updateCommunicationRoom(),
      this.communicationRepoService.createCommunicationMessage(),
    ]);
    this.server.to(payload.receiverSocketId).emit('receive_message', {
      productServiceId: productServiceId,
      senderId: client.user.id,
      senderSocketId: client.id,
      roomId: roomId,
      chatContext: chatContext,
      message: message,
    });
  }
}
