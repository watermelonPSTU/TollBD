import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { initDeposit, completeMockDeposit } from '@/api/wallet.api';
import { AppBar, PaymentMethodCard } from '@/components/shared';
import { PaymentMethod } from '@/types/transaction.types';

export const DepositPage = () => {
  const [params] = useSearchParams();
  const [amount, setAmount] = useState('500');
  const [method, setMethod] = useState<PaymentMethod>('SSLCOMMERZ');
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const isSuccess = Boolean(params.get('txId'));

  // After a successful recharge, return to the homepage automatically
  useEffect(() => {
    if (!isSuccess) return;
    const timer = setTimeout(() => navigate('/home', { replace: true }), 3000);
    return () => clearTimeout(timer);
  }, [isSuccess, navigate]);

  const mutation = useMutation({
    mutationFn: () => initDeposit(Number(amount), method as 'SSLCOMMERZ' | 'BKASH' | 'NAGAD' | 'CARD'),
    onSuccess: async (data) => {
      if (data.isMock) {
        try {
          await completeMockDeposit(data.mockTranId ?? data.transactionId, data.mockAmount ?? data.amountTaka);
          queryClient.invalidateQueries({ queryKey: ['wallet'] });
          navigate(`/wallet/deposit/success?txId=${data.mockTranId ?? data.transactionId}`, { replace: true });
        } catch {
          toast.error('Deposit failed');
        }
      } else {
        window.location.href = data.gatewayUrl;
      }
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Deposit failed')
  });

  if (isSuccess) {
    queryClient.invalidateQueries({ queryKey: ['wallet'] });
    return (
      <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-bg px-6 text-center">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/4 top-1/3 h-48 w-48 rounded-full bg-emerald-400/10 blur-3xl" />
        </div>
        <div className="relative mx-auto flex h-28 w-28 items-center justify-center">
          <div className="absolute inset-0 rounded-full bg-emerald-400/20 animate-ping" />
          <div className="relative flex h-full w-full items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-xl shadow-emerald-400/30 text-white text-5xl font-bold">✓</div>
        </div>
        <h1 className="mt-6 font-bengali text-2xl font-bold text-text-primary">রিচার্জ সফল! 🎉</h1>
        <p className="mt-2 font-bengali text-sm text-text-muted">আপনার ওয়ালেটে টাকা যোগ হয়েছে</p>
        <p className="mt-2 font-mono text-xs text-text-muted">{params.get('txId')}</p>
        <p className="mt-6 font-bengali text-xs text-text-muted animate-pulse">হোমপেজে ফিরে যাচ্ছি…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-bg pb-6">
      <AppBar title="Deposit" titleBn="টাকা যোগ করুন" showBack />
      <section className="space-y-5 px-5 py-5">
        {/* Amount input */}
        <div className="overflow-hidden rounded-3xl bg-primary text-white shadow-xl shadow-primary/30">
          <div className="px-6 py-6 text-center">
            <p className="font-bengali text-xs font-medium text-white/60">পরিমাণ লিখুন</p>
            <div className="mt-2 flex items-center justify-center gap-1">
              <span className="text-3xl font-bold text-white/70">৳</span>
              <input
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                inputMode="numeric"
                className="w-36 bg-transparent text-center text-4xl font-bold text-white outline-none placeholder:text-white/30"
                placeholder="0"
              />
            </div>
            <p className="mt-2 font-bengali text-xs text-white/50">সর্বনিম্ন ৳১০</p>
          </div>
          {/* Quick amounts */}
          <div className="flex gap-2 overflow-x-auto border-t border-white/10 px-5 py-3 scrollbar-none">
            {[100, 200, 500, 1000, 2000].map((item) => (
              <button
                key={item}
                onClick={() => setAmount(String(item))}
                className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-bold transition ${Number(amount) === item ? 'bg-white text-primary' : 'bg-white/15 text-white hover:bg-white/25'}`}
              >
                ৳{item}
              </button>
            ))}
          </div>
        </div>

        <p className="font-bengali text-xs font-semibold text-text-muted">পেমেন্ট পদ্ধতি</p>

        <div className="space-y-3">
          {(['SSLCOMMERZ', 'BKASH', 'NAGAD', 'CARD'] as PaymentMethod[]).map((item) => (
            <PaymentMethodCard key={item} method={item} isSelected={method === item} onClick={() => setMethod(item)} />
          ))}
        </div>

        <button
          disabled={mutation.isPending || Number(amount) < 10}
          onClick={() => mutation.mutate()}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 font-bengali font-bold text-white shadow-lg shadow-primary/25 disabled:opacity-50 active:scale-[0.98] transition"
        >
          {mutation.isPending ? (
            <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> প্রক্রিয়াকরণ...</>
          ) : (
            'এগিয়ে যান →'
          )}
        </button>
      </section>
    </main>
  );
};

