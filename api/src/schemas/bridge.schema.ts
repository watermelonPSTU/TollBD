import { BridgeCategory, BridgeStatus, VehicleCategory } from '@prisma/client';
import { z } from 'zod';

export const bridgeFilterSchema = z.object({
  category: z.nativeEnum(BridgeCategory).optional(),
  status: z.nativeEnum(BridgeStatus).optional()
});

export const bridgeCreateSchema = z.object({
  name: z.string().min(2).max(120),
  nameBn: z.string().min(2).max(120),
  location: z.string().min(2).max(160),
  district: z.string().min(2).max(80),
  latitude: z.coerce.number(),
  longitude: z.coerce.number(),
  category: z.nativeEnum(BridgeCategory),
  authorityName: z.string().min(2).max(120),
  hasFastpass: z.coerce.boolean().optional(),
  // Form sends '' when no image is given — treat empty as absent
  imageUrl: z.preprocess((v) => (v === '' ? undefined : v), z.string().url().optional())
});

export const bridgeUpdateSchema = bridgeCreateSchema.partial().extend({
  status: z.nativeEnum(BridgeStatus).optional()
});

export const tollRateSchema = z.object({
  rateA: z.coerce.number().int().nonnegative(),
  rateB: z.coerce.number().int().nonnegative(),
  rateC: z.coerce.number().int().nonnegative(),
  rateD: z.coerce.number().int().nonnegative(),
  rateE: z.coerce.number().int().nonnegative(),
  rateF: z.coerce.number().int().nonnegative()
});

export const calculateQuerySchema = z.object({
  bridgeId: z.string().uuid(),
  category: z.nativeEnum(VehicleCategory)
});
