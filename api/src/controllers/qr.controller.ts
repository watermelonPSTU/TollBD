import { Request, Response } from 'express';
import * as qrService from '../services/qr.service';
import { success } from '../utils/response';

export const generateQR = async (req: Request, res: Response) => {
  const qr = await qrService.generateToken(req.user!.id, req.body.vehicleId);
  return success(res, qr, 'QR generated', 201);
};

export const getCurrentQR = async (req: Request, res: Response) => {
  const qr = await qrService.getCurrentQR(req.user!.id, req.params.vehicleId);
  return success(res, qr);
};

export const getQRStatus = async (req: Request, res: Response) => {
  const status = await qrService.getTokenStatus(req.user!.id, req.params.tokenId);
  return success(res, status);
};

export const scanQR = async (req: Request, res: Response) => {
  const result = await qrService.validateAndUse(req.body.tokenData, req.body.bridgeId, req.user!.id);
  return success(res, result, 'QR scanned and toll charged');
};
