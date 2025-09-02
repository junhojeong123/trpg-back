
import { IsString, IsNotEmpty, IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class GetChatLogsDto {
  @IsString()
  @IsNotEmpty()
  roomCode: string;

  /**
   * 가져올 메시지 수 (기본: 50, 최소:1, 최대:200)
   * 쿼리 파라미터는 문자열로 들어오므로 transform 필요
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 50;
}
