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
    // ✅ 1. 공백 제거 (가장 중요한 수정!)
    const cleanCommand = command.trim();
    
    // ✅ 2. 업그레이드된 정규식 (공백 허용 + 유연한 부호 처리)
    const regex = /^(\d+)d(\d+)([+-]?\d*)?$/;
    const match = cleanCommand.match(regex);

    if (!match) {
      throw new Error('유효하지 않은 주사위 명령어입니다. 예: "2d6+3"');
    }

    const count = parseInt(match[1], 10);
    const sides = parseInt(match[2], 10);
    
    // ✅ 3. modifier 안전 파싱 (빈 문자열/부호 처리)
    let modifier = 0;
    if (match[3]) {
      const modStr = match[3].trim();
      if (modStr) {
        modifier = parseInt(modStr, 10);
        if (isNaN(modifier)) modifier = 0; // 안전 장치
      }
    }

    // ✅ 4. sides 검증 조건 완화 (1면 주사위 허용)
    if (count < 1 || sides < 1) {
      throw new Error('주사위 수량은 1 이상, 면수는 1 이상이어야 합니다.');
    }

    const rolls = Array.from({ length: count }, () => this.rollDice(sides));
    const total = rolls.reduce((sum, val) => sum + val, 0) + modifier;

    // ✅ 5. detail 생성 시 modifier 0 처리 개선
    const detail = 
      `${rolls.join(' + ')}` + 
      (modifier !== 0 
        ? ` ${modifier > 0 ? '+' : '-'} ${Math.abs(modifier)}` 
        : '');

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
