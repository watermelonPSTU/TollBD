import { apiClient, unwrap } from './client';
import { DashboardStats, AdminUser } from '@/types/admin.types';
import { BridgeWithRate } from './bridge.api';
import { Vehicle } from '@/types/vehicle.types';
import { Transaction } from '@/types/transaction.types';
import { Paginated } from './wallet.api';
import { QRScanResponse } from './qr.api';
import { VerifyVehicleRequest } from './vehicle.api';

export interface Announcement {
  id: string;
  title: string;
  titleBn: string;
  body: string;
  bodyBn: string;
  type: 'INFO' | 'WARNING' | 'MAINTENANCE';
  targetBridgeIds: string[];
  isActive: boolean;
  expiresAt?: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

export const getDashboardStats = () => apiClient.get('/admin/dashboard/stats').then(unwrap<DashboardStats>);

export const getUsers = (params?: { search?: string; status?: string; page?: number; limit?: number }) => {
  return apiClient.get('/admin/users', { params }).then(unwrap<Paginated<AdminUser>>);
};

export const getUserById = (id: string) => apiClient.get(`/admin/users/${id}`).then(unwrap<AdminUser & {
  vehicles: Array<{ id: string; registrationNumber: string; vehicleType: string; vehicleCategory: string; status: string; createdAt: string }>;
  transactions: Array<{ id: string; amount: number; bridgeName: string; vehiclePlate: string; status: string; paymentMethod: string; createdAt: string }>;
}>);

export const getAllVehicles = (params?: { status?: string; page?: number; limit?: number }) =>
  apiClient
    .get('/admin/vehicles', { params })
    .then(unwrap<{ items: Vehicle[]; total: number; page: number; limit: number }>)
    .then((data) => data.items);

export const blockUser = (id: string, action: 'block' | 'unblock') =>
  apiClient.patch(`/admin/users/${id}/block`, { blocked: action === 'block' }).then(unwrap<AdminUser>);

export const createBridge = (data: Omit<BridgeWithRate, 'id' | 'createdAt' | 'updatedAt' | 'tollRate'>) =>
  apiClient.post('/admin/bridges', data).then(unwrap<BridgeWithRate>);

export const setBridgeStatus = (id: string, status: string) =>
  apiClient.patch(`/admin/bridges/${id}/status`, { status }).then(unwrap<BridgeWithRate>);

export const getPendingVehicles = () => apiClient.get('/admin/vehicles/pending').then(unwrap<Vehicle[]>);

export const verifyVehicle = (id: string, data: VerifyVehicleRequest) => apiClient.patch(`/admin/vehicles/${id}/verify`, data).then(unwrap<Vehicle>);

export const getBridges = () => apiClient.get('/bridges').then(unwrap<BridgeWithRate[]>);

export const updateBridge = (id: string, data: Partial<BridgeWithRate>) => apiClient.patch(`/admin/bridges/${id}`, data).then(unwrap<BridgeWithRate>);

export const updateTollRates = (bridgeId: string, rates: Record<'rateA' | 'rateB' | 'rateC' | 'rateD' | 'rateE' | 'rateF', number>) => {
  return apiClient.put(`/admin/bridges/${bridgeId}/rates`, rates).then(unwrap<unknown>);
};

export const getAllTransactions = (params?: { status?: string; page?: number; limit?: number }) => {
  return apiClient.get('/admin/transactions', { params }).then(unwrap<Paginated<Transaction>>);
};

export const refundTransaction = (id: string, reason: string, amount?: number) => {
  return apiClient.post(`/admin/transactions/${id}/refund`, { reason, amount }).then(unwrap<Transaction>);
};

export const scanQR = (tokenData: string, bridgeId: string) => apiClient.post('/qr/scan', { tokenData, bridgeId }).then(unwrap<QRScanResponse>);

export const getAnnouncements = (adminMode = false) =>
  apiClient.get(adminMode ? '/admin/announcements' : '/users/announcements').then(unwrap<Announcement[]>);

export const createAnnouncement = (data: Omit<Announcement, 'id' | 'createdAt' | 'updatedAt' | 'createdById' | 'isActive'> & { expiresAt?: string }) => {
  return apiClient.post('/admin/announcements', data).then(unwrap<Announcement>);
};

export const broadcast = (payload: { title: string; body: string; icon?: string; data?: Record<string, unknown> }) => {
  return apiClient.post('/admin/notifications/broadcast', payload).then(unwrap<{ sent: number }>);
};
