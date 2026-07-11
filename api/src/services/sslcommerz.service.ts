import axios from 'axios';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { AppError } from '../middleware/error.middleware';

const baseUrl = env.SSLCOMMERZ_IS_LIVE ? 'https://securepay.sslcommerz.com' : 'https://sandbox.sslcommerz.com';

export interface SSLSessionParams {
  amount: number;
  currency: 'BDT';
  transactionId: string;
  successUrl: string;
  failUrl: string;
  cancelUrl: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string | null;
  productName: string;
}

const mockSession = (transactionId: string, amountTaka: number) => ({
  gatewayUrl: '',
  sessionKey: `mock_${transactionId}`,
  isMock: true as const,
  mockTranId: transactionId,
  mockAmount: amountTaka
});

export const createSession = async (params: SSLSessionParams) => {
  if (!env.SSLCOMMERZ_STORE_ID || !env.SSLCOMMERZ_STORE_PASS) {
    return mockSession(params.transactionId, params.amount);
  }

  try {
    const response = await axios.post(
      `${baseUrl}/gwprocess/v4/api.php`,
      new URLSearchParams({
        store_id: env.SSLCOMMERZ_STORE_ID,
        store_passwd: env.SSLCOMMERZ_STORE_PASS,
        total_amount: params.amount.toFixed(2),
        currency: params.currency,
        tran_id: params.transactionId,
        success_url: params.successUrl,
        fail_url: params.failUrl,
        cancel_url: params.cancelUrl,
        cus_name: params.customerName,
        cus_email: params.customerEmail,
        cus_phone: params.customerPhone ?? '01700000000',
        cus_add1: 'Bangladesh',
        cus_city: 'Dhaka',
        cus_country: 'Bangladesh',
        shipping_method: 'NO',
        product_name: params.productName,
        product_category: 'Toll',
        product_profile: 'general'
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 }
    );

    if (!response.data?.GatewayPageURL || !response.data?.sessionkey) {
      logger.error('SSLCommerz session rejected', {
        isLive: env.SSLCOMMERZ_IS_LIVE,
        status: response.data?.status,
        failedreason: response.data?.failedreason
      });
      if (env.NODE_ENV !== 'production') return mockSession(params.transactionId, params.amount);
      throw new AppError('SSLCommerz session creation failed', 502, 'SSLCOMMERZ_SESSION_FAILED');
    }

    return {
      gatewayUrl: response.data.GatewayPageURL as string,
      sessionKey: response.data.sessionkey as string
    };
  } catch (error) {
    if (env.NODE_ENV !== 'production') return mockSession(params.transactionId, params.amount);
    throw error instanceof AppError ? error : new AppError('SSLCommerz session creation failed', 502, 'SSLCOMMERZ_SESSION_FAILED');
  }
};

export const validateIPN = async (params: Record<string, unknown>) => {
  const valId = String(params.val_id ?? '');
  const transactionId = String(params.tran_id ?? params.transactionId ?? '');
  const status = String(params.status ?? '').toUpperCase();
  const amount = Number(params.amount ?? params.store_amount ?? 0);
  const isMock = params.mock === '1' || params.mock === 1;

  if (!env.SSLCOMMERZ_STORE_ID || !env.SSLCOMMERZ_STORE_PASS || isMock) {
    return { valid: status === 'VALID' || status === 'SUCCESS' || Boolean(transactionId), amount, transactionId, status };
  }

  if (!valId) {
    return { valid: false, amount, transactionId, status };
  }

  const response = await axios.get(`${baseUrl}/validator/api/validationserverAPI.php`, {
    params: {
      val_id: valId,
      store_id: env.SSLCOMMERZ_STORE_ID,
      store_passwd: env.SSLCOMMERZ_STORE_PASS,
      format: 'json'
    },
    timeout: 15000
  });

  const validationStatus = String(response.data?.status ?? '').toUpperCase();
  return {
    valid: ['VALID', 'VALIDATED'].includes(validationStatus),
    amount: Number(response.data?.amount ?? amount),
    transactionId: String(response.data?.tran_id ?? transactionId),
    status: validationStatus
  };
};
