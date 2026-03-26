import { Global, Module } from '@nestjs/common';
import { RedisProvider, REDIS_CLIENT } from './redis.provider';

@Global()
@Module({
  providers: [RedisProvider],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
