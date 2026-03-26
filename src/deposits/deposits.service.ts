import { Injectable, Logger, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { ethers } from 'ethers';
import { Deposit, DepositStatus } from './entities/deposit.entity';
import { DepositJobPayload } from './dto/deposit-job.dto';
import { WalletsService } from '../wallets/wallets.service';
import { REDIS_CLIENT } from '../shared/redis/redis.provider';

const IDEMPOTENCY_TTL = 60 * 60 * 24 * 7; // 7 days in seconds

@Injectable()
export class DepositsService {
  private readonly logger = new Logger(DepositsService.name);

  constructor(
    @InjectRepository(Deposit)
    private readonly depositRepo: Repository<Deposit>,
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
    private readonly walletsService: WalletsService,
  ) {}

  /**
   * Called by the processor for each queued transfer event.
   * Fully idempotent — safe to call multiple times for the same tx.
   */
  async processDeposit(payload: DepositJobPayload): Promise<void> {
    const idempotencyKey = `deposit:processed:${payload.txHash}:${payload.logIndex}`;

    // Redis idempotency check — fast path before hitting the DB
    const alreadyProcessed = await this.redis.get(idempotencyKey);
    if (alreadyProcessed) {
      this.logger.warn(
        `Deposit ${payload.txHash}:${payload.logIndex} already processed (Redis hit) — skipping`,
      );
      return;
    }

    // Resolve which user owns this deposit address
    const wallet = await this.walletsService.findByAddress(payload.toAddress);
    if (!wallet) {
      this.logger.warn(
        `No wallet found for address ${payload.toAddress} — ignoring transfer`,
      );
      return;
    }

    // Convert raw amount to human-readable (e.g. 1000000 USDC → 1.000000)
    const amount = ethers.formatUnits(payload.rawAmount, payload.tokenDecimals);

    // Upsert the deposit record — unique constraint on (txHash, logIndex) prevents dupes
    try {
      const existing = await this.depositRepo.findOne({
        where: { txHash: payload.txHash, logIndex: payload.logIndex },
      });

      if (existing) {
        // Already in DB — update confirmation count only
        await this.depositRepo.update(existing.id, {
          confirmationsSeen: existing.confirmationsSeen + 1,
        });
        this.logger.log(
          `Updated confirmations for deposit ${existing.id}: ${existing.confirmationsSeen + 1}`,
        );
        return;
      }

      const deposit = this.depositRepo.create({
        userId: wallet.userId,
        txHash: payload.txHash,
        logIndex: payload.logIndex,
        blockNumber: payload.blockNumber,
        confirmationsRequired: 12,
        confirmationsSeen: 1,
        network: payload.network,
        tokenSymbol: payload.tokenSymbol,
        tokenDecimals: payload.tokenDecimals,
        contractAddress: payload.contractAddress,
        fromAddress: payload.fromAddress,
        toAddress: payload.toAddress,
        amount,
        rawAmount: payload.rawAmount,
        status: DepositStatus.PENDING,
      });

      await this.depositRepo.save(deposit);
      this.logger.log(
        `Deposit recorded: ${amount} ${payload.tokenSymbol} → user ${wallet.userId} (tx: ${payload.txHash})`,
      );
    } catch (err: any) {
      // Unique constraint violation = concurrent processor hit same tx
      if (err.code === '23505') {
        this.logger.warn(
          `Race condition on deposit insert — already exists, skipping`,
        );
        return;
      }
      throw err;
    }
  }

  /**
   * Called when a deposit reaches required confirmations.
   * This is the gate before we credit the ledger.
   */
  async confirmDeposit(depositId: string): Promise<Deposit> {
    const deposit = await this.depositRepo.findOneOrFail({
      where: { id: depositId },
    });

    if (deposit.status !== DepositStatus.PENDING) {
      this.logger.warn(
        `Deposit ${depositId} is already ${deposit.status} — skipping confirm`,
      );
      return deposit;
    }

    await this.depositRepo.update(depositId, {
      status: DepositStatus.CONFIRMED,
    });

    const idempotencyKey = `deposit:processed:${deposit.txHash}:${deposit.logIndex}`;
    await this.redis.setex(idempotencyKey, IDEMPOTENCY_TTL, '1');

    this.logger.log(`Deposit ${depositId} confirmed — ready for ledger credit`);

    // Phase 3: this.ledgerService.creditDeposit(deposit);
    // We call a stub here so the flow is wired end-to-end
    this.logger.log(
      `[STUB] Would credit ${deposit.amount} ${deposit.tokenSymbol} to user ${deposit.userId}`,
    );

    return deposit;
  }

  async getPendingDeposits(): Promise<Deposit[]> {
    return this.depositRepo.find({ where: { status: DepositStatus.PENDING } });
  }

  async getDepositsByUser(userId: string): Promise<Deposit[]> {
    return this.depositRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }
}
