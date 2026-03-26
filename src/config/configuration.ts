import * as Joi from 'joi';

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().default(5432),
  DB_USER: Joi.string().required(),
  DB_PASS: Joi.string().required(),
  DB_NAME: Joi.string().required(),
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRES_IN: Joi.string().default('7d'),
  ENCRYPTION_KEY: Joi.string().length(64).required(),
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),
  ETH_RPC_URL: Joi.string().uri().required(),
  POLYGON_RPC_URL: Joi.string().uri().required(),
  DEPOSIT_CONFIRMATIONS: Joi.number().default(12),
  USDC_ETH_CONTRACT: Joi.string().required(),
  USDT_ETH_CONTRACT: Joi.string().required(),
  USDC_POLYGON_CONTRACT: Joi.string().required(),
});

export default () => ({
  nodeEnv: process.env.NODE_ENV,
  database: {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT, 10),
    username: process.env.DB_USER,
    password: process.env.DB_PASS,
    name: process.env.DB_NAME,
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN,
  },
  encryptionKey: process.env.ENCRYPTION_KEY,
  redis: {
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT, 10),
  },
  blockchain: {
    ethRpcUrl: process.env.ETH_RPC_URL,
    polygonRpcUrl: process.env.POLYGON_RPC_URL,
    confirmations: parseInt(process.env.DEPOSIT_CONFIRMATIONS, 10) || 12,
    contracts: {
      usdcEth: process.env.USDC_ETH_CONTRACT,
      usdcEth: process.env.USDT_ETH_CONTRACT,
      usdcPolygon: process.env.USDC_POLYGON_CONTRACT,
    },
  },
});
