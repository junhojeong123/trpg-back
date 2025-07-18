import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

@Injectable()
export class RateLimitService {
  constructor(@Inject(CACHE_MANAGER) private cache: Cache) {}

  async isRateLimited(userId: string): Promise<boolean> {
    const key = `chat:${userId}`;
    const ttl = 60;
    const limit = 10;

    const rawCount = await this.cache.get<number>(key);
    const count = rawCount ?? 0;

    if (count >= limit) {
      return true;
    }

    if (count === 0) {
      await this.cache.set(key, 1, ttl); // 숫자 TTL은 OK
    } else {
      // 객체 TTL 안 될 경우, 강제 캐스팅 or 그냥 숫자 TTL을 재설정
      await (this.cache as any).set(key, count + 1, { ttl: 0 });
      // 또는 그냥 다시 ttl 설정해도 괜찮다면 아래처럼:
      // await this.cache.set(key, count + 1, ttl); // TTL 다시 설정됨 (슬라이딩처럼 됨)
    }

    return false;
  }
}
