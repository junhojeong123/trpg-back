import { IsString } from 'class-validator';

export class RollDto {
  @IsString()
  cmd: string;
}