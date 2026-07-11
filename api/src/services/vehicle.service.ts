import { Prisma, Role, VehicleStatus } from '@prisma/client';
import { prisma } from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { processVehiclePhoto, saveToUploads } from '../middleware/upload.middleware';
import * as brtaService from './brta.service';
import { sendToUser } from './push.service';
//

type VehicleData = {
  registrationNumber?: string;
  vehicleType?: Prisma.VehicleCreateInput['vehicleType'];
  vehicleCategory?: Prisma.VehicleCreateInput['vehicleCategory'];
  ownerName?: string;
  fuelType?: Prisma.VehicleCreateInput['fuelType'];
  brtaCertNumber?: string;
};

export const createVehicle = async (
  userId: string,
  data: Required<Pick<VehicleData, 'registrationNumber' | 'vehicleType' | 'vehicleCategory' | 'ownerName'>> & VehicleData,
  frontPhotoBuffer?: Buffer,
  backPhotoBuffer?: Buffer
) => {
  const frontPhotoUrl = frontPhotoBuffer
    ? await saveToUploads(await processVehiclePhoto(frontPhotoBuffer), userId, `vehicle-front-${Date.now()}.webp`)
    : undefined;
  const backPhotoUrl = backPhotoBuffer
    ? await saveToUploads(await processVehiclePhoto(backPhotoBuffer), userId, `vehicle-back-${Date.now()}.webp`)
    : undefined;
  const brtaResult = await brtaService.verifyVehicle(data.registrationNumber);

  return prisma.vehicle.create({
    data: {
      ownerId: userId,
      registrationNumber: data.registrationNumber,
      vehicleType: data.vehicleType,
      vehicleCategory: data.vehicleCategory,
      ownerName: data.ownerName,
      fuelType: data.fuelType,
      brtaCertNumber: data.brtaCertNumber,
      frontPhotoUrl,
      backPhotoUrl,
      status: VehicleStatus.PENDING,
      brtaVerified: brtaResult?.verified ?? null,
      brtaVerifiedAt: brtaResult ? new Date() : null,
      brtaData: brtaResult ? (brtaResult as unknown as Prisma.InputJsonValue) : undefined
    }
  });
};

export const getUserVehicles = (userId: string) => {
  return prisma.vehicle.findMany({ where: { ownerId: userId }, orderBy: { createdAt: 'desc' } });
};

export const getVehicleById = async (id: string, userId: string, role: Role) => {
  const vehicle = await prisma.vehicle.findUnique({ where: { id }, include: { owner: { select: { id: true, fullName: true, email: true } } } });

  if (!vehicle) {
    throw new AppError('Vehicle not found', 404, 'VEHICLE_NOT_FOUND');
  }

  if (role !== Role.ADMIN && vehicle.ownerId !== userId) {
    throw new AppError('Vehicle access denied', 403, 'VEHICLE_ACCESS_DENIED');
  }

  return vehicle;
};

export const updateVehicle = async (id: string, userId: string, data: VehicleData) => {
  const vehicle = await prisma.vehicle.findUnique({ where: { id } });
  if (!vehicle || vehicle.ownerId !== userId) {
    throw new AppError('Vehicle not found', 404, 'VEHICLE_NOT_FOUND');
  }
  if (vehicle.status !== VehicleStatus.PENDING) {
    throw new AppError('Only pending vehicles can be updated', 400, 'VEHICLE_NOT_EDITABLE');
  }

  return prisma.vehicle.update({ where: { id }, data });
};

export const deleteVehicle = async (id: string, userId: string) => {
  const vehicle = await prisma.vehicle.findUnique({ where: { id } });
  if (!vehicle || vehicle.ownerId !== userId) {
    throw new AppError('Vehicle not found', 404, 'VEHICLE_NOT_FOUND');
  }
  if (vehicle.status !== VehicleStatus.PENDING && vehicle.status !== VehicleStatus.REJECTED) {
    throw new AppError('Only pending or rejected vehicles can be deleted', 400, 'VEHICLE_NOT_DELETABLE');
  }

  await prisma.vehicle.delete({ where: { id } });
  return { deleted: true };
};

export const adminGetPendingVehicles = () => {
  return prisma.vehicle.findMany({
    where: { status: VehicleStatus.PENDING },
    include: { owner: { select: { id: true, fullName: true, email: true, phone: true } } },
    orderBy: { createdAt: 'asc' }
  });
};

export const adminGetAllVehicles = async (filters: { status?: VehicleStatus; type?: Prisma.VehicleCreateInput['vehicleType']; page: number; limit: number }) => {
  const where: Prisma.VehicleWhereInput = {
    status: filters.status,
    vehicleType: filters.type
  };
  const skip = (filters.page - 1) * filters.limit;
  const [items, total] = await Promise.all([
    prisma.vehicle.findMany({
      where,
      include: { owner: { select: { id: true, fullName: true, email: true, phone: true } } },
      orderBy: { createdAt: 'desc' },
      skip,
      take: filters.limit
    }),
    prisma.vehicle.count({ where })
  ]);

  return { items, total, page: filters.page, limit: filters.limit };
};

export const adminVerifyVehicle = async (vehicleId: string, adminId: string, action: 'APPROVE' | 'REJECT', reason?: string) => {
  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
  if (!vehicle) {
    throw new AppError('Vehicle not found', 404, 'VEHICLE_NOT_FOUND');
  }

  const updated = await prisma.vehicle.update({
    where: { id: vehicleId },
    data:
      action === 'APPROVE'
        ? { status: VehicleStatus.VERIFIED, verifiedAt: new Date(), verifiedById: adminId, rejectionReason: null }
        : { status: VehicleStatus.REJECTED, rejectionReason: reason, verifiedAt: null, verifiedById: null }
  });

  await sendToUser(vehicle.ownerId, {
    title: action === 'APPROVE' ? 'Vehicle approved' : 'Vehicle rejected',
    body:
      action === 'APPROVE'
        ? `${vehicle.registrationNumber} is now verified for toll payment.`
        : `${vehicle.registrationNumber} was rejected. ${reason ?? ''}`.trim(),
    data: { vehicleId, type: 'VEHICLE_VERIFICATION' }
  });

  return updated;
};
