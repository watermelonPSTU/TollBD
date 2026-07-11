import { Router } from 'express';
import * as adminController from '../controllers/admin.controller';
import * as bridgeController from '../controllers/bridge.controller';
import * as notificationController from '../controllers/notification.controller';
import * as tollController from '../controllers/toll.controller';
import * as vehicleController from '../controllers/vehicle.controller';
import { requireAdmin } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { announcementSchema, blockUserSchema, updateAnnouncementSchema } from '../schemas/admin.schema';
import { bridgeCreateSchema, bridgeUpdateSchema, tollRateSchema } from '../schemas/bridge.schema';
import { broadcastSchema } from '../schemas/notification.schema';
import { refundSchema } from '../schemas/toll.schema';
import { adminVerifySchema } from '../schemas/vehicle.schema';

export const adminRoutes = Router();

adminRoutes.use(requireAdmin);
adminRoutes.get('/dashboard/stats', adminController.dashboardStats);
adminRoutes.get('/users', adminController.getUsers);
adminRoutes.get('/users/:id', adminController.getUserById);
adminRoutes.patch('/users/:id/block', validate(blockUserSchema), adminController.blockUser);
adminRoutes.get('/stats/revenue', adminController.revenueStats);

adminRoutes.get('/vehicles', vehicleController.adminGetAllVehicles);
adminRoutes.get('/vehicles/pending', vehicleController.adminGetPendingVehicles);
adminRoutes.patch('/vehicles/:id/verify', validate(adminVerifySchema), vehicleController.adminVerifyVehicle);

adminRoutes.post('/bridges', validate(bridgeCreateSchema), bridgeController.adminCreateBridge);
adminRoutes.patch('/bridges/:id', validate(bridgeUpdateSchema), bridgeController.adminUpdateBridge);
adminRoutes.patch('/bridges/:id/status', bridgeController.adminToggleStatus);
adminRoutes.put('/bridges/:id/rates', validate(tollRateSchema), bridgeController.adminUpdateTollRate);

adminRoutes.get('/transactions', tollController.adminGetTransactions);
adminRoutes.post('/transactions/:id/refund', validate(refundSchema), tollController.refundTransaction);

adminRoutes.get('/announcements', adminController.getAnnouncements);
adminRoutes.post('/announcements', validate(announcementSchema), adminController.createAnnouncement);
adminRoutes.patch('/announcements/:id', validate(updateAnnouncementSchema), adminController.updateAnnouncement);
adminRoutes.delete('/announcements/:id', adminController.deleteAnnouncement);
adminRoutes.post('/notifications/broadcast', validate(broadcastSchema), notificationController.broadcast);
