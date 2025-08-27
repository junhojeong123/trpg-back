import { Controller, Get, Query } from '@nestjs/common';
import { DiceService } from './dice.service';

@Controller('dice')
export class DiceController {
  constructor(private readonly diceService: DiceService) {}

  // 주사위 굴리기
  @Get('roll')
  roll(@Query('cmd') command: string = '1d6'): { rolls: number[]; total: number } {
    return this.diceService.rollCommand(command);
  }

  // 주사위 히스토리 조회
  @Get('history')
  getHistory(): {
    timestamp: Date;
    command: string;
    result: { rolls: number[]; total: number };
  }[] {
    return this.diceService.getHistory();
  }
}