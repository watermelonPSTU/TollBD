import { randomBytes } from 'node:crypto';
import { Prisma, TransactionStatus } from '@prisma/client';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { AppError } from '../middleware/error.middleware';
import * as sslcommerz from './sslcommerz.service';

export class InsufficientBalanceError extends AppError {
  constructor() {
    super('Insufficient wallet balance', 400, 'INSUFFICIENT_BALANCE');
  }
}

type TxClient = Prisma.TransactionClient;

const db = (tx?: TxClient) => tx ?? prisma;

export const getOrCreateWallet = async (userId: string, tx?: TxClient) => {
  const client = db(tx);
  const wallet = await client.wallet.findUnique({ where: { userId } });
  if (wallet) {
    return wallet;
  }
  return client.wallet.create({ data: { userId, balance: 0 } });
};

export const getBalance = async (userId: string) => {
  const wallet = await getOrCreateWallet(userId);
  return { balance: wallet.balance, balanceTaka: wallet.balance / 100 };
};

export const getTransactions = async (userId: string, page = 1, limit = 20) => {
  const wallet = await getOrCreateWallet(userId);
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    prisma.walletTransaction.findMany({ where: { walletId: wallet.id }, orderBy: { createdAt: 'desc' }, skip, take: limit }),
    prisma.walletTransaction.count({ where: { walletId: wallet.id } })
  ]);
  return { items, total, page, limit };
};

export const creditWallet = async (userId: string, amountPaisa: number, description: string, reference?: string, tx?: TxClient) => {
  const execute = async (client: TxClient) => {
    const wallet = await getOrCreateWallet(userId, client);
    const updated = await client.wallet.update({
      where: { id: wallet.id },
      data: { balance: { increment: amountPaisa } }
    });
    const transaction = await client.walletTransaction.create({
      data: { walletId: wallet.id, type: 'CREDIT', amount: amountPaisa, description, reference }
    });
    return { wallet: updated, transaction };
  };

  return tx ? execute(tx) : prisma.$transaction(execute);
};

export const debitWallet = async (userId: string, amountPaisa: number, description: string, reference?: string, tx?: TxClient) => {
  const execute = async (client: TxClient) => {
    const wallet = await getOrCreateWallet(userId, client);
    if (wallet.balance < amountPaisa) {
      throw new InsufficientBalanceError();
    }
    const updated = await client.wallet.update({
      where: { id: wallet.id },
      data: { balance: { decrement: amountPaisa } }
    });
    const transaction = await client.walletTransaction.create({
      data: { walletId: wallet.id, type: 'DEBIT', amount: amountPaisa, description, reference }
    });
    return { wallet: updated, transaction };
  };

  return tx ? execute(tx) : prisma.$transaction(execute);
};

export const initDeposit = async (userId: string, amountPaisa: number, method: string) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  // SSLCommerz caps tran_id at 30 chars — keep it short and carry userId in value_a
  const transactionId = `dep_${randomBytes(10).toString('hex')}`;
  const session = await sslcommerz.createSession({
    amount: amountPaisa / 100,
    currency: 'BDT',
    transactionId,
    successUrl: `${env.API_BASE_URL}/api/v1/wallet/deposit/success`,
    failUrl: `${env.FRONTEND_URL}/wallet/deposit/failed`,
    cancelUrl: `${env.FRONTEND_URL}/wallet/deposit/cancelled`,
    customerName: user.fullName,
    customerEmail: user.email,
    customerPhone: user.phone,
    productName: `TollBD Wallet Deposit ${method}`,
    valueA: userId
  });

  return { ...session, transactionId, amount: amountPaisa, amountTaka: amountPaisa / 100 };
};

export const handleDepositSuccess = async (params: Record<string, unknown>, knownUserId?: string) => {
  const validation = await sslcommerz.validateIPN(params);
  if (!validation.valid) {
    throw new AppError('SSLCommerz payment validation failed', 400, 'INVALID_PAYMENT');
  }

  const transactionId = validation.transactionId;
  const existing = await prisma.walletTransaction.findFirst({ where: { reference: transactionId, type: 'CREDIT' } });
  if (existing) {
    return { transactionId, credited: false };
  }

  // userId travels in value_a; legacy tran_ids embedded it as dep_<userId>_<ts>
  const userId = knownUserId || validation.valueA || String(transactionId.split('_')[1] ?? '');
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    logger.error('Deposit user not found from callback', { transactionId, valueA: validation.valueA });
    throw new AppError('Deposit user not found', 404, 'DEPOSIT_USER_NOT_FOUND');
  }

  const amountPaisa = Math.round(validation.amount * 100);
  await creditWallet(user.id, amountPaisa, 'Wallet deposit via SSLCommerz', transactionId);
  return { transactionId, credited: true, status: TransactionStatus.SUCCESS };
};
