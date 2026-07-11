import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import fs from 'node:fs';
import path from 'node:path';
import { env } from './config/env';
import { AppError, errorMiddleware } from './middleware/error.middleware';
import { generalLimiter } from './middleware/rateLimit.middleware';
import { routes } from './routes';
import { requestLogger } from './config/logger';

export const app = express();

const allowedOrigins = [
  env.FRONTEND_URL,
  // Capacitor WebView origins (Android serves the bundled app from https://localhost)
  'https://localhost',
  'capacitor://localhost',
  // SSLCommerz posts payment callbacks from the gateway page in the user's browser
  'https://sandbox.sslcommerz.com',
  'https://securepay.sslcommerz.com',
  // Accept Railway-injected public domain (set RAILWAY_PUBLIC_DOMAIN in dashboard)
  ...(process.env.RAILWAY_PUBLIC_DOMAIN ? [`https://${process.env.RAILWAY_PUBLIC_DOMAIN}`] : [])
].filter(Boolean);

app.use(
  helmet({
    // Allow Google Sign-In popup to postMessage back to the opener
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    contentSecurityPolicy: false
  })
);
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      // Allow any localhost or local network IP in development
      if (env.NODE_ENV !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/.test(origin)) {
        return callback(null, true);
      }
      // AppError so the error middleware answers 403 instead of a generic 500
      callback(new AppError(`CORS: origin ${origin} not allowed`, 403, 'CORS_NOT_ALLOWED'));
    },
    credentials: true
  })
);
app.disable('x-powered-by');
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use('/uploads', express.static(path.resolve(env.UPLOAD_DIR), { maxAge: '1d' }));

// Serve the built web app from the same server (single-service deploy).
// __dirname is api/src in dev and api/dist in prod — both are two levels below repo root.
const webDist = path.resolve(__dirname, '../../apps/web/dist');
const hasWebDist = fs.existsSync(path.join(webDist, 'index.html'));
if (hasWebDist) {
  app.use(
    express.static(webDist, {
      maxAge: '1d',
      setHeaders: (res, filePath) => {
        // index.html must not be cached so new deploys show up immediately
        if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
      }
    })
  );
}
app.use(requestLogger);

app.get('/', (_req, res) => {
  res.json({ success: true, data: { name: 'TollBD API', docs: '/api/v1', health: '/health' }, message: null, error: null });
});

// Health check BEFORE rate limiter — Railway polls this frequently
app.get('/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok', env: env.NODE_ENV, ts: new Date().toISOString() }, message: null, error: null });
});

app.use(generalLimiter);

app.use('/api/v1', routes);

// SPA fallback: any non-API GET serves the web app so client-side routes work on refresh
if (hasWebDist) {
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads') || req.path === '/health') return next();
    res.sendFile(path.join(webDist, 'index.html'));
  });
}

app.use(errorMiddleware);
