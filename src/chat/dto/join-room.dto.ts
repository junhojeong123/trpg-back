import { IsString, Matches } from 'class-validator';

/**
 * 방 입장 요청 DTO
 * 클라이언트가 방에 입장할 때 필요한 정보
 */
export class JoinRoomDto {
  // 방 코드 (4-20자의 영문자 또는 숫자)
  @IsString()
  @Matches(/^[a-zA-Z0-9]{4,20}$/, {
    message: '방 코드는 4-20자의 영문자 또는 숫자여야 합니다',
  })
  roomCode: string;
}