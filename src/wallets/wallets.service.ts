import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import * as crypto from 'crypto';
import { Wallet, Network } from './entities/wallet.entity';

@Injectable()
export class WalletsService {
  private readonly logger = new Logger(WalletsService.name);
  private readonly algorithm = 'aes-256-gcm';

  constructor(
    @InjectRepository(Wallet)
    private readonly walletRepo: Repository<Wallet>,
    private readonly config: ConfigService,
  ) {}

  async provisionWallet(userId: string, network: Network): Promise<Wallet> {
    // Check if wallet already exists for this user + network
    const existing = await this.walletRepo.findOne({
      where: { userId, network, isActive: true },
    });
    if (existing) return existing;

    // Derive key index (simple counter — in production use HD wallet with BIP44)
    const count = await this.walletRepo.count({ where: { network } });
    const keyIndex = count;

    // Generate fresh keypair
    const ethWallet = ethers.Wallet.createRandom();
    const address = ethWallet.address;
    const privateKey = ethWallet.privateKey;

    // Encrypt private key before persisting
    const encryptedPrivateKey = this.encryptKey(privateKey);

    const wallet = this.walletRepo.create({
      userId,
      address,
      network,
      encryptedPrivateKey,
      keyIndex,
    });

    await this.walletRepo.save(wallet);
    this.logger.log(
      `Provisioned wallet ${address} for user ${userId} on ${network}`,
    );

    return wallet;
  }

  async getWalletsByUser(userId: string): Promise<Wallet[]> {
    return this.walletRepo.find({ where: { userId, isActive: true } });
  }

  async findByAddress(address: string): Promise<Wallet | null> {
    return this.walletRepo.findOne({
      where: { address: address.toLowerCase() },
    });
  }

  async getWalletsByNetwork(network: Network): Promise<Wallet[]> {
    return this.walletRepo.find({ where: { network, isActive: true } });
  }

  // INTERNAL ONLY — never expose this via controller
  async getPrivateKey(walletId: string): Promise<string> {
    const wallet = await this.walletRepo
      .createQueryBuilder('wallet')
      .addSelect('wallet.encryptedPrivateKey')
      .where('wallet.id = :id', { id: walletId })
      .getOne();

    if (!wallet) throw new Error('Wallet not found');
    return this.decryptKey(wallet.encryptedPrivateKey);
  }

  private encryptKey(plaintext: string): string {
    const key = Buffer.from(this.config.get<string>('encryptionKey'), 'hex');
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    // Format: iv:authTag:ciphertext (all hex)
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  private decryptKey(stored: string): string {
    const [ivHex, authTagHex, encryptedHex] = stored.split(':');
    const key = Buffer.from(this.config.get<string>('encryptionKey'), 'hex');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');
    const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
    decipher.setAuthTag(authTag);
    // Buffer.concat instead of string + to avoid type mismatch
    return Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString('utf8');
  }
  exports: [WalletsService];
}
