import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Deposit } from './entities/deposit.entity';
import { DepositsService } from './deposits.service';
import { DepositListenerService } from './deposit-listener.service';
import { DepositProcessorService } from './deposit-processor.service';
import { WalletsModule } from '../wallets/wallets.module';
import { DEPOSIT_QUEUE } from './constants/queues';

@Module({
  imports: [
    TypeOrmModule.forFeature([Deposit]),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('redis.host'),
          port: config.get<number>('redis.port'),
          maxRetriesPerRequest: null,
        },
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueue({ name: DEPOSIT_QUEUE }),
    WalletsModule,
  ],
  providers: [DepositsService, DepositListenerService, DepositProcessorService],
  exports: [DepositsService],
})
export class DepositsModule {}
