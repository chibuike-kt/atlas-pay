export interface DepositJobPayload {
  txHash: string;
  logIndex: number;
  blockNumber: number;
  network: string; // 'ethereum' | 'polygon'
  contractAddress: string; // token contract
  fromAddress: string;
  toAddress: string; // the deposit address — maps to a user
  rawAmount: string; // raw on-chain amount (before decimals), as string
  tokenSymbol: string; // 'USDC' | 'USDT'
  tokenDecimals: number;
}
