import { Module } from '@nestjs/common';
import { DiceController } from './dice.controller';
import { DiceService } from './dice.service';

@Module({
  controllers: [DiceController],
  providers: [DiceService],
})
export class DiceModule {}