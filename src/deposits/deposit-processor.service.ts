import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { DEPOSIT_QUEUE, DepositJobNames } from './constants/queues';
import { DepositsService } from './deposits.service';
import { DepositJobPayload } from './dto/deposit-job.dto';

@Processor(DEPOSIT_QUEUE, {
  concurrency: 5, // process up to 5 deposit jobs in parallel
})
export class DepositProcessorService extends WorkerHost {
  private readonly logger = new Logger(DepositProcessorService.name);

  constructor(private readonly depositsService: DepositsService) {
    super();
  }

  async process(job: Job<DepositJobPayload>): Promise<void> {
    const { name, data } = job;

    this.logger.log(
      `Processing job [${name}] id=${job.id} tx=${data.txHash}:${data.logIndex}`,
    );

    switch (name) {
      case DepositJobNames.PROCESS_TRANSFER:
        await this.handleTransfer(data);
        break;
      default:
        this.logger.warn(`Unknown job name: ${name}`);
    }
  }

  private async handleTransfer(payload: DepositJobPayload): Promise<void> {
    try {
      await this.depositsService.processDeposit(payload);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      this.logger.error(
        `Failed to process deposit ${payload.txHash}:${payload.logIndex} — ${message}`,
        stack,
      );
      throw err;
    }
  }
}
