import { Request, Response } from 'express';
import { Prisma, TransactionType, UserStatus } from '@prisma/client';
import { prisma } from '../config/database';
import { announcementSchema, updateAnnouncementSchema, revenueQuerySchema, usersQuerySchema } from '../schemas/admin.schema';
import { success } from '../utils/response';

// Revenue days follow Bangladesh time (UTC+6, no DST) — the server itself runs in UTC
const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;

const startOfDhakaDay = (daysAgo = 0) => {
  const shifted = new Date(Date.now() + DHAKA_OFFSET_MS);
  shifted.setUTCHours(0, 0, 0, 0);
  shifted.setUTCDate(shifted.getUTCDate() - daysAgo);
  return new Date(shifted.getTime() - DHAKA_OFFSET_MS);
};

const dhakaDateKey = (date: Date) => new Date(date.getTime() + DHAKA_OFFSET_MS).toISOString().slice(0, 10);

export const dashboardStats = async (_req: Request, res: Response) => {
  const today = startOfDhakaDay(0);
  const [todayAgg, todayTransactionCount, totalActiveUsers, pendingVehicleCount, paymentGroups] = await Promise.all([
    prisma.transaction.aggregate({
      where: { createdAt: { gte: today }, status: 'SUCCESS', type: 'TOLL_PAYMENT' },
      _sum: { amount: true }
    }),
    prisma.transaction.count({ where: { createdAt: { gte: today }, status: 'SUCCESS', type: 'TOLL_PAYMENT' } }),
    prisma.user.count({ where: { status: UserStatus.ACTIVE } }),
    prisma.vehicle.count({ where: { status: 'PENDING' } }),
    prisma.transaction.groupBy({
      by: ['paymentMethod'],
      where: { status: 'SUCCESS', type: 'TOLL_PAYMENT' },
      _count: { _all: true }
    })
  ]);

  const weeklyRevenue = await Promise.all(
    Array.from({ length: 7 }).map(async (_, index) => {
      const start = startOfDhakaDay(6 - index);
      const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
      const aggregate = await prisma.transaction.aggregate({
        where: { createdAt: { gte: start, lt: end }, status: 'SUCCESS', type: 'TOLL_PAYMENT' },
        _sum: { amount: true }
      });
      return { date: dhakaDateKey(start), amountPaisa: aggregate._sum.amount ?? 0 };
    })
  );

  const paymentMethodBreakdown = { WALLET: 0, SSLCOMMERZ: 0, BKASH: 0, NAGAD: 0, CARD: 0 };
  for (const group of paymentGroups) {
    paymentMethodBreakdown[group.paymentMethod] = group._count._all;
  }

  return success(res, {
    todayRevenuePaisa: todayAgg._sum.amount ?? 0,
    todayTransactionCount,
    totalActiveUsers,
    pendingVehicleCount,
    weeklyRevenue,
    paymentMethodBreakdown
  });
};

export const getUsers = async (req: Request, res: Response) => {
  const query = usersQuerySchema.parse(req.query);
  const where: Prisma.UserWhereInput = {
    status: query.status,
    OR: query.search
      ? [
          { email: { contains: query.search, mode: 'insensitive' } },
          { fullName: { contains: query.search, mode: 'insensitive' } },
          { phone: { contains: query.search, mode: 'insensitive' } }
        ]
      : undefined
  };
  const skip = (query.page - 1) * query.limit;
  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        phone: true,
        fullName: true,
        role: true,
        status: true,
        emailVerified: true,
        createdAt: true,
        wallet: { select: { balance: true } },
        _count: { select: { vehicles: true, transactions: true } }
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: query.limit
    }),
    prisma.user.count({ where })
  ]);

  return success(res, { items, total, page: query.page, limit: query.limit });
};

export const getUserById = async (req: Request, res: Response) => {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: req.params.id },
    select: {
      id: true, email: true, phone: true, fullName: true, photoUrl: true,
      role: true, status: true, emailVerified: true, division: true, district: true,
      emergencyContact: true, nidNumber: true, createdAt: true, updatedAt: true,
      wallet: { select: { balance: true } },
      _count: { select: { vehicles: true, transactions: true } },
      vehicles: { select: { id: true, registrationNumber: true, vehicleType: true, vehicleCategory: true, status: true, createdAt: true }, orderBy: { createdAt: 'desc' } },
      transactions: { where: { type: 'TOLL_PAYMENT' }, select: { id: true, amount: true, bridgeName: true, vehiclePlate: true, status: true, paymentMethod: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 10 }
    }
  });
  return success(res, user);
};

export const blockUser = async (req: Request, res: Response) => {
  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: { status: req.body.blocked ? 'BLOCKED' : 'ACTIVE' },
    select: { id: true, email: true, fullName: true, status: true }
  });
  return success(res, user, req.body.blocked ? 'User blocked' : 'User unblocked');
};

export const deleteUser = async (req: Request, res: Response) => {
  const { id } = req.params;

  if (id === req.user!.id) {
    return res.status(400).json({ success: false, data: null, message: 'You cannot delete your own account', error: { code: 'SELF_DELETE_FORBIDDEN', details: null } });
  }

  const target = await prisma.user.findUniqueOrThrow({ where: { id }, select: { id: true, role: true, email: true } });
  if (target.role === 'ADMIN') {
    return res.status(400).json({ success: false, data: null, message: 'Admin accounts cannot be deleted', error: { code: 'ADMIN_DELETE_FORBIDDEN', details: null } });
  }

  await prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.findUnique({ where: { userId: id } });
    if (wallet) {
      await tx.walletTransaction.deleteMany({ where: { walletId: wallet.id } });
    }
    await tx.qrToken.deleteMany({ where: { userId: id } });
    await tx.transaction.deleteMany({ where: { userId: id } });
    await tx.vehicle.deleteMany({ where: { ownerId: id } });
    if (wallet) {
      await tx.wallet.delete({ where: { id: wallet.id } });
    }
    await tx.pushSubscription.deleteMany({ where: { userId: id } });
    await tx.otp.deleteMany({ where: { userId: id } });
    await tx.user.delete({ where: { id } });
  });

  return success(res, { id, email: target.email }, 'User and all related data deleted');
};

export const revenueStats = async (req: Request, res: Response) => {
  const query = revenueQuerySchema.parse(req.query);
  const from = query.from ? new Date(query.from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const to = query.to ? new Date(query.to) : new Date();
  const transactions = await prisma.transaction.findMany({
    where: { createdAt: { gte: from, lte: to }, status: 'SUCCESS', type: TransactionType.TOLL_PAYMENT },
    select: { amount: true, createdAt: true }
  });
  const buckets = new Map<string, number>();
  for (const transaction of transactions) {
    const dhakaDate = dhakaDateKey(transaction.createdAt);
    const key = query.groupBy === 'month' ? dhakaDate.slice(0, 7) : dhakaDate;
    buckets.set(key, (buckets.get(key) ?? 0) + transaction.amount);
  }
  return success(res, Array.from(buckets.entries()).map(([date, amountPaisa]) => ({ date, amountPaisa })));
};

export const getAnnouncements = async (_req: Request, res: Response) => {
  const announcements = await prisma.announcement.findMany({ orderBy: { createdAt: 'desc' } });
  return success(res, announcements);
};

export const createAnnouncement = async (req: Request, res: Response) => {
  const body = announcementSchema.parse(req.body);
  const announcement = await prisma.announcement.create({
    data: {
      ...body,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      createdById: req.user!.id
    }
  });
  return success(res, announcement, 'Announcement created', 201);
};

export const updateAnnouncement = async (req: Request, res: Response) => {
  const { id } = req.params;
  const body = updateAnnouncementSchema.parse(req.body);
  const announcement = await prisma.announcement.update({
    where: { id },
    data: { ...body, expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined }
  });
  return success(res, announcement, 'Announcement updated');
};

export const deleteAnnouncement = async (req: Request, res: Response) => {
  const { id } = req.params;
  await prisma.announcement.delete({ where: { id } });
  return success(res, null, 'Announcement deleted');
};
