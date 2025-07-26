import { Injectable } from '@nestjs/common';

@Injectable()
export class DiceService {
  // 주사위 결과 히스토리 저장소
  private history: {
    timestamp: Date;
    command: string;
    result: { rolls: number[]; total: number; detail: string };
  }[] = [];

  // 주사위 명령어 파싱 및 실행 (예: "2d6+3")
  rollCommand(command: string): { rolls: number[]; total: number; detail: string } {
    const regex = /^(\d+)d(\d+)([+-]\d+)?$/;
    const match = command.match(regex);

    if (!match) {
      throw new Error('유효하지 않은 주사위 명령어입니다. 예: "2d6+3"');
    }

    const count = parseInt(match[1], 10);
    const sides = parseInt(match[2], 10);
    const modifier = match[3] ? parseInt(match[3], 10) : 0;

    if (count < 1 || sides < 2) {
      throw new Error('주사위 수량은 1 이상, 면수는 2 이상이어야 합니다.');
    }

    const rolls = Array.from({ length: count }, () => this.rollDice(sides));
    const total = rolls.reduce((sum, val) => sum + val, 0) + modifier;

    // 문자열 형태 결과: 예) "3 + 4 + 5 + 2"
    const detail =
      `${rolls.join(' + ')}` +
      (modifier !== 0 ? (modifier > 0 ? ` + ${modifier}` : ` - ${Math.abs(modifier)}`) : '');

    // 히스토리에 기록
    this.recordRoll(command, { rolls, total, detail });

    return { rolls, total, detail };
  }

  // 단일 주사위 굴리기
  private rollDice(sides: number): number {
    return Math.floor(Math.random() * sides) + 1;
  }

  // 주사위 결과 기록
  recordRoll(command: string, result: { rolls: number[]; total: number; detail: string }): void {
    this.history.unshift({
      timestamp: new Date(),
      command,
      result,
    });

    // 최근 10개만 저장
    if (this.history.length > 10) {
      this.history.pop();
    }
  }

  // 히스토리 조회
  getHistory(): typeof this.history {
    return this.history;
  }
}
