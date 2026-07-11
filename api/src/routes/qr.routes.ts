import { Router } from 'express';
import * as controller from '../controllers/qr.controller';
import { requireAdmin, requireAuth } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { generateQRSchema, scanQRSchema } from '../schemas/qr.schema';

export const qrRoutes = Router();

qrRoutes.post('/generate', requireAuth, validate(generateQRSchema), controller.generateQR);
qrRoutes.post('/scan', requireAdmin, validate(scanQRSchema), controller.scanQR);
// Must be registered before /:vehicleId so "status" isn't captured as a vehicleId
qrRoutes.get('/status/:tokenId', requireAuth, controller.getQRStatus);
qrRoutes.get('/:vehicleId', requireAuth, controller.getCurrentQR);
