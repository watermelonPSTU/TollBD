import { Request, Response } from 'express';
import { env } from '../config/env';
import { paginationSchema } from '../schemas/wallet.schema';
import * as walletService from '../services/wallet.service';
import { success } from '../utils/response';

export const getWallet = async (req: Request, res: Response) => {
  const balance = await walletService.getBalance(req.user!.id);
  const transactions = await walletService.getTransactions(req.user!.id, 1, 5);
  return success(res, { ...balance, recentTransactions: transactions.items });
};

export const getWalletTransactions = async (req: Request, res: Response) => {
  const query = paginationSchema.parse(req.query);
  const transactions = await walletService.getTransactions(req.user!.id, query.page, query.limit);
  return success(res, transactions);
};

export const initDeposit = async (req: Request, res: Response) => {
  const amountPaisa = Math.round(Number(req.body.amount) * 100);
  const session = await walletService.initDeposit(req.user!.id, amountPaisa, req.body.method);
  return success(res, session, 'Deposit session created');
};

export const depositSuccess = async (req: Request, res: Response) => {
  const result = await walletService.handleDepositSuccess({ ...req.query, ...req.body });
  return res.redirect(`${env.FRONTEND_URL}/wallet/deposit/success?txId=${result.transactionId}`);
};

export const depositFailed = async (_req: Request, res: Response) => {
  return res.redirect(`${env.FRONTEND_URL}/wallet/deposit/failed`);
};

export const completeMockDeposit = async (req: Request, res: Response) => {
  const { transactionId, amount } = req.body;
  const result = await walletService.handleDepositSuccess(
    {
      tran_id: transactionId,
      status: 'VALID',
      amount,
      mock: 1
    },
    req.user!.id
  );
  return success(res, result);
};
