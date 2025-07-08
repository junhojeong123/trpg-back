import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
@Injectable()
export class RateLimitService {
  private redis: Redis | null = null;

  constructor() {
    if (process.env.USE_REDIS === 'true') {
      this.redis = new Redis();
      this.redis.on('error', (err) => {
        console.error('Redis 연결 오류:', err.message);
      });
    }
  }

  async isRateLimited(userId: string): Promise<boolean> {
    if (!this.redis) {
      // Redis 비활성화 시 항상 통과
      return false;
    }

    const key = `chat:${userId}`;
    const ttl = 60;
    const limit = 10;

    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, ttl);
    }

    return count > limit;
  }
}