import { useEffect } from 'react';
import { CheckCircle } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { QRDisplay } from '@/components/shared';
import { useCapacitor } from '@/hooks/useCapacitor';
import { useUIStore } from '@/store/uiStore';

export const PaymentSuccessPage = () => {
  const [params] = useSearchParams();
  const txId = params.get('txId') ?? params.get('transactionId') ?? 'SUCCESS';
  const clear = useUIStore((state) => state.clearTollSelection);
  const { vibrate } = useCapacitor();
  const navigate = useNavigate();

  useEffect(() => {
    clear();
    vibrate();
  }, [clear, vibrate]);

  // Return to the homepage automatically after a successful payment
  useEffect(() => {
    const timer = setTimeout(() => navigate('/home', { replace: true }), 5000);
    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <main className="relative flex min-h-screen flex-col items-center overflow-hidden bg-bg px-6 pb-10 pt-16 text-center">
      {/* Confetti-style background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/4 top-1/4 h-48 w-48 rounded-full bg-emerald-400/10 blur-3xl" />
        <div className="absolute right-1/4 bottom-1/3 h-40 w-40 rounded-full bg-primary/10 blur-3xl" />
      </div>

      <div className="relative">
        {/* Success icon */}
        <div className="relative mx-auto flex h-28 w-28 items-center justify-center">
          <div className="absolute inset-0 animate-ping rounded-full bg-emerald-400/20" />
          <div className="absolute inset-2 rounded-full bg-emerald-50" />
          <div className="relative flex h-full w-full items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-xl shadow-emerald-400/40">
            <CheckCircle className="h-14 w-14 text-white" />
          </div>
        </div>

        <h1 className="mt-6 font-bengali text-3xl font-bold text-text-primary">পেমেন্ট সফল! 🎉</h1>
        <p className="mt-2 font-bengali text-sm text-text-muted">আপনার টোল পেমেন্ট সম্পন্ন হয়েছে</p>

        {/* Transaction ID */}
        <div className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-surface px-4 py-2.5 ring-1 ring-border/60">
          <span className="text-xs text-text-muted">TX:</span>
          <span className="font-mono text-xs font-bold text-primary">{txId.slice(0, 20)}{txId.length > 20 ? '…' : ''}</span>
        </div>

        {/* QR */}
        <div className="mt-6 rounded-3xl bg-surface p-5 shadow-sm ring-1 ring-border/60">
          <p className="mb-3 font-bengali text-xs font-medium text-text-muted">টোল গেটে এই QR দেখান</p>
          <QRDisplay data={txId} size={160} />
        </div>
      </div>

      <div className="mt-auto w-full pt-8">
        <p className="mb-3 font-bengali text-xs text-text-muted animate-pulse">হোমপেজে ফিরে যাচ্ছি…</p>
        <div className="grid grid-cols-2 gap-3">
          <Link
            to="/home"
            className="flex items-center justify-center rounded-2xl border border-border/60 bg-surface py-4 font-bengali font-bold text-text-primary transition active:scale-[0.98]"
          >
            হোম
          </Link>
          <Link
            to={`/history/${txId}`}
            className="flex items-center justify-center rounded-2xl bg-primary py-4 font-bengali font-bold text-white shadow-lg shadow-primary/30 transition active:scale-[0.98]"
          >
            রসিদ দেখুন
          </Link>
        </div>
      </div>
    </main>
  );
};

