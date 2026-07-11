import { PaymentMethod, Prisma, TransactionStatus, TransactionType, VehicleCategory, VehicleStatus } from '@prisma/client';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { AppError } from '../middleware/error.middleware';
import * as bridgeService from './bridge.service';
import * as sslcommerz from './sslcommerz.service';
import { sendToUser } from './push.service';
import { creditWallet, debitWallet } from './wallet.service';

export const calculateToll = (bridgeId: string, vehicleCategory: VehicleCategory) => {
  return bridgeService.getTollRateForVehicle(bridgeId, vehicleCategory);
};

export const processWalletPayment = async (transactionId: string, userId: string, amountPaisa: number) => {
  return prisma.$transaction(async (tx) => {
    await debitWallet(userId, amountPaisa, 'Toll payment', transactionId, tx);
    return tx.transaction.update({
      where: { id: transactionId },
      data: { status: TransactionStatus.SUCCESS }
    });
  });
};

export const initTollPayment = async (userId: string, vehicleId: string, bridgeId: string, method: PaymentMethod) => {
  const [vehicle, bridge] = await Promise.all([
    prisma.vehicle.findUnique({ where: { id: vehicleId } }),
    prisma.bridge.findUnique({ where: { id: bridgeId } })
  ]);

  if (!vehicle || vehicle.ownerId !== userId) {
    throw new AppError('Verified owned vehicle is required', 404, 'VEHICLE_NOT_FOUND');
  }
  if (vehicle.status !== VehicleStatus.VERIFIED) {
    throw new AppError('Vehicle must be verified before toll payment', 400, 'VEHICLE_NOT_VERIFIED');
  }
  if (!bridge) {
    throw new AppError('Bridge not found', 404, 'BRIDGE_NOT_FOUND');
  }

  const amount = await calculateToll(bridgeId, vehicle.vehicleCategory);
  const transaction = await prisma.transaction.create({
    data: {
      userId,
      vehicleId,
      vehiclePlate: vehicle.registrationNumber,
      bridgeId,
      bridgeName: bridge.name,
      amount,
      paymentMethod: method,
      type: TransactionType.TOLL_PAYMENT,
      status: TransactionStatus.PENDING
    }
  });

  if (method === PaymentMethod.WALLET) {
    const completed = await processWalletPayment(transaction.id, userId, amount);
    return { transactionId: completed.id, amount, status: completed.status };
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const session = await sslcommerz.createSession({
    amount: amount / 100,
    currency: 'BDT',
    // SSLCommerz caps tran_id at 30 chars; the full uuid travels in value_a
    transactionId: transaction.id.replace(/-/g, '').slice(0, 30),
    successUrl: `${env.API_BASE_URL}/api/v1/toll/success`,
    failUrl: `${env.FRONTEND_URL}/toll/failed`,
    cancelUrl: `${env.FRONTEND_URL}/toll/cancelled`,
    customerName: user.fullName,
    customerEmail: user.email,
    customerPhone: user.phone,
    productName: `TollBD Toll Payment ${bridge.name}`,
    valueA: transaction.id
  });

  await prisma.transaction.update({
    where: { id: transaction.id },
    data: { sslSessionKey: session.sessionKey }
  });

  return { transactionId: transaction.id, amount, status: transaction.status, gatewayUrl: session.gatewayUrl, sessionKey: session.sessionKey };
};

export const handleSSLCommerzCallback = async (params: Record<string, unknown>) => {
  const validation = await sslcommerz.validateIPN(params);
  // value_a carries the full transaction uuid (tran_id is truncated to 30 chars by SSLCommerz)
  const transactionId = validation.valueA || validation.transactionId || String(params.tran_id ?? '');
  const transaction = await prisma.transaction.findFirst({
    where: { OR: [{ id: transactionId }, { sslSessionKey: String(params.sessionkey ?? '') }] }
  });

  if (!transaction) {
    throw new AppError('Transaction not found', 404, 'TRANSACTION_NOT_FOUND');
  }

  const updated = await prisma.transaction.update({
    where: { id: transaction.id },
    data: {
      status: validation.valid ? TransactionStatus.SUCCESS : TransactionStatus.FAILED,
      sslTransactionId: String(params.bank_tran_id ?? params.tran_id ?? transaction.id)
    }
  });

  return updated;
};

export const getMyTolls = async (userId: string, filters: { status?: TransactionStatus; page: number; limit: number }) => {
  const where: Prisma.TransactionWhereInput = { userId, type: TransactionType.TOLL_PAYMENT, status: filters.status };
  const skip = (filters.page - 1) * filters.limit;
  const [items, total] = await Promise.all([
    prisma.transaction.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: filters.limit }),
    prisma.transaction.count({ where })
  ]);
  return { items, total, page: filters.page, limit: filters.limit };
};

export const getTransactionById = async (id: string, userId: string, isAdmin = false) => {
  const transaction = await prisma.transaction.findUnique({ where: { id } });
  if (!transaction || (!isAdmin && transaction.userId !== userId)) {
    throw new AppError('Transaction not found', 404, 'TRANSACTION_NOT_FOUND');
  }
  return transaction;
};

export const adminGetAllTransactions = async (filters: { status?: TransactionStatus; page: number; limit: number }) => {
  const where: Prisma.TransactionWhereInput = { status: filters.status };
  const skip = (filters.page - 1) * filters.limit;
  const [items, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      include: {
        user: { select: { id: true, fullName: true, email: true } },
        vehicle: true,
        bridge: true
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: filters.limit
    }),
    prisma.transaction.count({ where })
  ]);
  return { items, total, page: filters.page, limit: filters.limit };
};

export const processRefund = async (transactionId: string, _adminId: string, reason: string, amount?: number) => {
  const transaction = await prisma.transaction.findUnique({ where: { id: transactionId } });
  if (!transaction) {
    throw new AppError('Transaction not found', 404, 'TRANSACTION_NOT_FOUND');
  }
  if (transaction.status !== TransactionStatus.SUCCESS) {
    throw new AppError('Only successful transactions can be refunded', 400, 'REFUND_NOT_ALLOWED');
  }

  const refundAmount = amount ?? transaction.amount;
  const updated = await prisma.$transaction(async (tx) => {
    await creditWallet(transaction.userId, refundAmount, 'Toll payment refund', transaction.id, tx);
    return tx.transaction.update({
      where: { id: transaction.id },
      data: { status: TransactionStatus.REFUNDED, refundReason: reason, refundedAt: new Date() }
    });
  });

  await sendToUser(transaction.userId, {
    title: 'Refund processed',
    body: `৳${(refundAmount / 100).toFixed(2)} has been refunded to your TollBD wallet.`,
    data: { transactionId: transaction.id, type: 'REFUND' }
  });

  return updated;
};
