import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  Unique,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum DepositStatus {
  PENDING = 'pending', // seen on chain, awaiting confirmations
  CONFIRMING = 'confirming', // N-1 confirmations reached, waiting for final
  CONFIRMED = 'confirmed', // confirmations met, ledger credited
  FAILED = 'failed', // something went wrong (logged, alertable)
}

@Entity('deposits')
@Unique(['txHash', 'logIndex']) // DB-level idempotency guarantee
export class Deposit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id' })
  userId: string;

  @Index()
  @Column({ name: 'tx_hash' })
  txHash: string;

  @Column({ name: 'log_index' })
  logIndex: number;

  @Column({ name: 'block_number' })
  blockNumber: number;

  @Column({ name: 'confirmations_required' })
  confirmationsRequired: number;

  @Column({ name: 'confirmations_seen', default: 0 })
  confirmationsSeen: number;

  @Column()
  network: string;

  @Column({ name: 'token_symbol' })
  tokenSymbol: string;

  @Column({ name: 'token_decimals' })
  tokenDecimals: number;

  @Column({ name: 'contract_address' })
  contractAddress: string;

  @Column({ name: 'from_address' })
  fromAddress: string;

  @Column({ name: 'to_address' })
  toAddress: string;

  // Human-readable amount stored as string to avoid float precision loss
  @Column({ name: 'amount', type: 'numeric', precision: 36, scale: 18 })
  amount: string;

  // Raw on-chain amount (wei equivalent)
  @Column({ name: 'raw_amount', type: 'numeric', precision: 78, scale: 0 })
  rawAmount: string;

  @Column({ type: 'enum', enum: DepositStatus, default: DepositStatus.PENDING })
  status: DepositStatus;

  // Set once ledger is credited (Phase 3 will populate this)
  @Column({ name: 'ledger_transaction_id', nullable: true })
  ledgerTransactionId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
