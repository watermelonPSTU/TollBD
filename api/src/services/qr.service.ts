import jwt from 'jsonwebtoken';
import QRCode from 'node-qrcode';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { AppError } from '../middleware/error.middleware';
import { initTollPayment } from './toll.service';

const qrSecret = env.QR_SECRET ?? env.JWT_ACCESS_SECRET;

interface QRPayload {
  tokenId: string;
  userId: string;
  vehicleId: string;
  plate: string;
}

export const generateToken = async (userId: string, vehicleId: string) => {
  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
  if (!vehicle || vehicle.ownerId !== userId) {
    throw new AppError('Vehicle not found', 404, 'VEHICLE_NOT_FOUND');
  }
  if (vehicle.status !== 'VERIFIED') {
    throw new AppError('Vehicle must be verified before QR generation', 400, 'VEHICLE_NOT_VERIFIED');
  }

  await prisma.qrToken.deleteMany({
    where: { vehicleId, used: false, expiresAt: { gt: new Date() } }
  });

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const token = await prisma.qrToken.create({
    data: {
      userId,
      vehicleId,
      vehiclePlate: vehicle.registrationNumber,
      tokenData: 'pending',
      expiresAt
    }
  });
  const tokenData = jwt.sign({ tokenId: token.id, userId, vehicleId, plate: vehicle.registrationNumber }, qrSecret, { expiresIn: '24h' });
  const updated = await prisma.qrToken.update({ where: { id: token.id }, data: { tokenData } });
  const qrDataUrl = await QRCode.toDataURL(tokenData);

  return { tokenId: updated.id, tokenData, qrDataUrl, expiresAt: updated.expiresAt, vehiclePlate: updated.vehiclePlate };
};

export const getCurrentQR = async (userId: string, vehicleId: string) => {
  const token = await prisma.qrToken.findFirst({
    where: { userId, vehicleId, used: false, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' }
  });

  if (!token) {
    return null;
  }

  return {
    tokenId: token.id,
    tokenData: token.tokenData,
    qrDataUrl: await QRCode.toDataURL(token.tokenData),
    expiresAt: token.expiresAt,
    vehiclePlate: token.vehiclePlate
  };
};

export const getTokenStatus = async (userId: string, tokenId: string) => {
  const token = await prisma.qrToken.findUnique({ where: { id: tokenId } });
  if (!token || token.userId !== userId) {
    throw new AppError('QR token not found', 404, 'QR_NOT_FOUND');
  }

  if (!token.used) {
    return { used: false as const, expiresAt: token.expiresAt };
  }

  // The scan created the toll transaction moments before usedAt was stamped
  const transaction = await prisma.transaction.findFirst({
    where: {
      vehicleId: token.vehicleId,
      type: 'TOLL_PAYMENT',
      ...(token.usedAtBridgeId ? { bridgeId: token.usedAtBridgeId } : {}),
      ...(token.usedAt ? { createdAt: { gte: new Date(token.usedAt.getTime() - 60_000) } } : {})
    },
    orderBy: { createdAt: 'desc' }
  });

  return {
    used: true as const,
    usedAt: token.usedAt,
    vehiclePlate: token.vehiclePlate,
    bridgeName: transaction?.bridgeName ?? null,
    amount: transaction?.amount ?? null,
    status: transaction?.status ?? null
  };
};

export const validateAndUse = async (tokenData: string, bridgeId: string, _adminId: string) => {
  let payload: QRPayload;
  try {
    payload = jwt.verify(tokenData, qrSecret) as QRPayload;
  } catch {
    // 400, not 401 — a bad QR is a request error; 401 makes the web client clear the admin session
    throw new AppError('Invalid QR token', 400, 'INVALID_QR');
  }

  const token = await prisma.qrToken.findUnique({
    where: { id: payload.tokenId },
    include: { user: true, vehicle: true }
  });
  if (!token || token.tokenData !== tokenData) {
    throw new AppError('QR token not found', 404, 'QR_NOT_FOUND');
  }
  if (token.used) {
    throw new AppError('QR token already used', 400, 'QR_ALREADY_USED');
  }
  if (token.expiresAt < new Date()) {
    throw new AppError('QR token expired', 400, 'QR_EXPIRED');
  }

  const payment = await initTollPayment(token.userId, token.vehicleId, bridgeId, 'WALLET');
  await prisma.qrToken.update({
    where: { id: token.id },
    data: { used: true, usedAt: new Date(), usedAtBridgeId: bridgeId }
  });

  return {
    success: true,
    vehiclePlate: token.vehiclePlate,
    ownerName: token.user.fullName,
    amount: payment.amount,
    transactionId: payment.transactionId
  };
};
