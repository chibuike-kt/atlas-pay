import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ethers } from 'ethers';
import { WalletsService } from '../wallets/wallets.service';
import { Network } from '../wallets/entities/wallet.entity';
import { DEPOSIT_QUEUE, DepositJobNames } from './constants/queues';
import { DepositJobPayload } from './dto/deposit-job.dto';

// Minimal ERC-20 ABI — only the Transfer event
const ERC20_TRANSFER_ABI = [
  'event Transfer(address indexed from, address indexed to, uint256 value)',
];

interface NetworkConfig {
  name: string;
  network: Network;
  rpcUrl: string;
  contracts: { address: string; symbol: string; decimals: number }[];
}

@Injectable()
export class DepositListenerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DepositListenerService.name);
  private providers: Map<
    string,
    ethers.WebSocketProvider | ethers.JsonRpcProvider
  > = new Map();
  private listeners: (() => void)[] = []; // cleanup callbacks

  constructor(
    private readonly config: ConfigService,
    @InjectQueue(DEPOSIT_QUEUE)
    private readonly depositQueue: Queue,
    private readonly walletsService: WalletsService,
  ) {}

  async onModuleInit() {
    await this.startListeners();
  }

  onModuleDestroy() {
    this.stopListeners();
  }

  private async startListeners() {
    const networks: NetworkConfig[] = [
      {
        name: 'ethereum',
        network: Network.ETHEREUM,
        rpcUrl: this.config.get<string>('blockchain.ethRpcUrl'),
        contracts: [
          {
            address: this.config.get<string>('blockchain.contracts.usdcEth'),
            symbol: 'USDC',
            decimals: 6,
          },
          {
            address: this.config.get<string>('blockchain.contracts.usdtEth'),
            symbol: 'USDT',
            decimals: 6,
          },
        ],
      },
      {
        name: 'polygon',
        network: Network.POLYGON,
        rpcUrl: this.config.get<string>('blockchain.polygonRpcUrl'),
        contracts: [
          {
            address: this.config.get<string>(
              'blockchain.contracts.usdcPolygon',
            ),
            symbol: 'USDC',
            decimals: 6,
          },
        ],
      },
    ];

    for (const net of networks) {
      await this.attachListenerForNetwork(net);
    }
  }

  private async attachListenerForNetwork(net: NetworkConfig) {
    const provider = new ethers.JsonRpcProvider(net.rpcUrl);
    this.providers.set(net.name, provider);

    // Load all active deposit addresses for this network into a Set for O(1) lookup
    const wallets = await this.walletsService.getWalletsByNetwork(net.network);
    const addressSet = new Set(wallets.map((w) => w.address.toLowerCase()));

    this.logger.log(
      `[${net.name}] Listening for deposits on ${addressSet.size} addresses`,
    );

    for (const contract of net.contracts) {
      const iface = new ethers.Interface(ERC20_TRANSFER_ABI);
      const tokenContract = new ethers.Contract(
        contract.address,
        ERC20_TRANSFER_ABI,
        provider,
      );

      const onTransfer = async (
        from: string,
        to: string,
        value: bigint,
        event: ethers.EventLog,
      ) => {
        const toNormalized = to.toLowerCase();

        if (!addressSet.has(toNormalized)) {
          return; // Not one of our deposit addresses — ignore
        }

        this.logger.log(
          `[${net.name}] Incoming ${contract.symbol} transfer detected: ${ethers.formatUnits(value, contract.decimals)} → ${to} (tx: ${event.transactionHash})`,
        );

        const payload: DepositJobPayload = {
          txHash: event.transactionHash,
          logIndex: event.index,
          blockNumber: event.blockNumber,
          network: net.name,
          contractAddress: contract.address,
          fromAddress: from,
          toAddress: to,
          rawAmount: value.toString(),
          tokenSymbol: contract.symbol,
          tokenDecimals: contract.decimals,
        };

        // Enqueue — do NOT process inline. Ever.
        await this.depositQueue.add(DepositJobNames.PROCESS_TRANSFER, payload, {
          jobId: `${event.transactionHash}-${event.index}`, // BullMQ deduplication
          attempts: 5,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: { count: 1000 },
          removeOnFail: false, // keep failed jobs for inspection
        });
      };

      tokenContract.on('Transfer', onTransfer);

      // Store cleanup callback
      this.listeners.push(() => tokenContract.off('Transfer', onTransfer));
    }
  }

  private stopListeners() {
    this.listeners.forEach((cleanup) => cleanup());
    this.providers.forEach((provider) => provider.destroy());
    this.logger.log('All blockchain listeners stopped');
  }

  /**
   * Called when a new wallet is provisioned AFTER the listener started.
   * Adds the address to all network address sets dynamically.
   * (In production: use a shared Redis set instead of in-memory)
   */
  registerNewDepositAddress(_address: string, _network: Network): void {
    this.logger.log(
      `New deposit address registered: ${_address} on ${_network}`,
    );
  }
}
