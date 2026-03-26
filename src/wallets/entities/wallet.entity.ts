import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum Network {
  ETHEREUM = 'ethereum',
  POLYGON = 'polygon',
}

@Entity('wallets')
export class Wallet {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id' })
  userId: string;

  @Index()
  @Column({ unique: true })
  address: string; // public deposit address

  @Column({ type: 'enum', enum: Network })
  network: Network;

  // Encrypted private key — never exposed via API
  @Column({ name: 'encrypted_private_key', select: false })
  encryptedPrivateKey: string;

  @Column({ name: 'key_index' })
  keyIndex: number; // HD wallet derivation index

  @Column({ default: true, name: 'is_active' })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
