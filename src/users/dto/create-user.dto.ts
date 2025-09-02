import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class CreateUserDto {
  @ApiProperty({
    description: 'TRPG 게임 내에서 사용할 캐릭터 이름',
    example: '검은 기사 라이언',
    type: String,
    required: true,
    minLength: 2,
    maxLength: 30
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  name: string;

  @ApiProperty({
    description: '채팅에서 표시될 닉네임',
    example: 'GM',
    type: String,
    required: true,
    minLength: 2,
    maxLength: 20
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  nickname: string;

  @ApiProperty({
    description: '로그인에 사용할 이메일 주소',
    example: 'user@trpg.com',
    type: String,
    required: true,
    format: 'email'
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    description: '계정 보안을 위한 비밀번호',
    example: 'password123',
    type: String,
    required: true,
    format: 'password',
    minLength: 8
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  password: string;
}