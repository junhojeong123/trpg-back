import { IsString, IsNotEmpty, Length, Matches } from 'class-validator';


export class SendMessageDto {
  // 방 코드 (4-20자의 영문자 또는 숫자)
  @IsString()
  @Matches(/^[a-zA-Z0-9]{4,20}$/, {
    message: '방 코드는 4-20자의 영문자 또는 숫자여야 합니다',
  })
  roomCode: string;

  @IsString()
  @IsNotEmpty()
  @Length(1, 500)
  message: string;
}