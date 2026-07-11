import { useEffect, useMemo, useState } from 'react';
import { CheckCircle, RefreshCw, Share2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import html2canvas from 'html2canvas';
import { generateQR, getQR, getQRStatus, QRStatusResponse } from '@/api/qr.api';
import { getMyVehicles } from '@/api/vehicle.api';
import { AppBar, EmptyState, QRDisplay } from '@/components/shared';
import { useCapacitor } from '@/hooks/useCapacitor';
import { formatBDT } from '@/utils/format';

export const MyQRPage = () => {
  const vehicles = useQuery({ queryKey: ['vehicles'], queryFn: getMyVehicles });
  const verified = useMemo(() => (vehicles.data ?? []).filter((vehicle) => vehicle.status === 'VERIFIED'), [vehicles.data]);
  const [vehicleId, setVehicleId] = useState('');
  const selected = vehicleId || verified[0]?.id;
  const qr = useQuery({ queryKey: ['qr', selected], queryFn: () => getQR(selected), enabled: Boolean(selected) });
  const queryClient = useQueryClient();
  const { shareContent } = useCapacitor();
  const [paymentDone, setPaymentDone] = useState<QRStatusResponse | null>(null);

  // Poll the displayed token so the user gets a popup the moment the gate scans it
  const tokenId = qr.data?.tokenId;
  const status = useQuery({
    queryKey: ['qr-status', tokenId],
    queryFn: () => getQRStatus(tokenId!),
    enabled: Boolean(tokenId) && !paymentDone,
    refetchInterval: 3000
  });

  useEffect(() => {
    if (status.data?.used && !paymentDone) {
      setPaymentDone(status.data);
      queryClient.invalidateQueries({ queryKey: ['qr', selected] });
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
    }
  }, [status.data, paymentDone, queryClient, selected]);
  const mutation = useMutation({
    mutationFn: () => generateQR(selected),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['qr', selected] });
      toast.success('QR তৈরি হয়েছে');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'QR failed')
  });

  const share = async () => {
    const element = document.getElementById('qr-card');
    if (element) await html2canvas(element);
    await shareContent('TollBD QR', qr.data?.tokenData ?? '');
  };

  return (
    <main className="min-h-screen bg-bg pb-28">
      <AppBar
        title="QR FastPass"
        titleBn="QR FastPass"
        actions={
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-bg hover:bg-border/50 transition"
          >
            <RefreshCw className={`h-4 w-4 text-text-secondary ${mutation.isPending ? 'animate-spin' : ''}`} />
          </button>
        }
      />
      <section className="space-y-4 px-5 py-5">
        {verified.length ? (
          <>
            {/* Vehicle selector */}
            <div className="flex gap-2 overflow-x-auto scrollbar-none pb-0.5">
              {verified.map((vehicle) => (
                <button
                  key={vehicle.id}
                  onClick={() => setVehicleId(vehicle.id)}
                  className={`shrink-0 rounded-full px-4 py-2 font-mono text-xs font-bold transition ${selected === vehicle.id ? 'bg-primary text-white shadow-sm' : 'border border-border/60 bg-surface text-text-secondary hover:border-border'}`}
                >
                  {vehicle.registrationNumber}
                </button>
              ))}
            </div>

            {/* QR Card */}
            <div id="qr-card" className="overflow-hidden rounded-3xl bg-surface shadow-sm ring-1 ring-border/60">
              <div className="bg-gradient-to-r from-primary to-primary/80 px-5 py-3 text-center">
                <p className="font-bengali text-sm font-bold text-white">TollBD QR FastPass</p>
                <p className="font-mono text-xs text-white/70">{verified.find((v) => v.id === selected)?.registrationNumber}</p>
              </div>
              <div className="flex flex-col items-center px-6 py-6">
                {qr.data ? (
                  <>
                    <QRDisplay data={qr.data.tokenData} size={220} />
                    <p className="mt-4 font-bengali text-xs font-medium text-text-muted">
                      মেয়াদ: {qr.data.expiresAt ? new Date(qr.data.expiresAt).toLocaleString('bn-BD') : 'একক ব্যবহার'}
                    </p>
                  </>
                ) : (
                  <div className="py-10 text-center">
                    <div className="mb-4 text-5xl opacity-20">▪▪▪</div>
                    <p className="font-bengali text-sm text-text-muted mb-4">QR এখনো তৈরি হয়নি</p>
                    <button
                      onClick={() => mutation.mutate()}
                      className="rounded-full bg-primary px-6 py-2.5 font-bengali text-sm font-bold text-white"
                    >
                      QR তৈরি করুন
                    </button>
                  </div>
                )}
              </div>
              <div className="border-t border-border/50 bg-bg/50 px-5 py-3 text-center">
                <p className="font-bengali text-xs text-text-muted">টোল গেটে এই QR কোড স্ক্যান করান</p>
              </div>
            </div>

            <button
              onClick={share}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-secondary py-4 font-bengali font-bold text-white shadow-lg shadow-secondary/25 active:scale-[0.98] transition"
            >
              <Share2 className="h-4 w-4" /> QR শেয়ার করুন
            </button>
          </>
        ) : (
          <EmptyState
            title="No verified vehicle"
            titleBn="অনুমোদিত গাড়ি নেই"
            description="QR needs an approved vehicle."
            descriptionBn="QR তৈরি করতে admin approved গাড়ি লাগবে।"
            icon={<span className="text-4xl">🔲</span>}
          />
        )}
      </section>

      {/* Toll payment success popup */}
      {paymentDone && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-6">
          <div className="w-full max-w-sm rounded-3xl bg-surface p-6 text-center shadow-2xl">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
              <CheckCircle className="h-9 w-9 text-emerald-600" />
            </div>
            <h2 className="mt-4 font-bengali text-lg font-bold text-text-primary">টোল পেমেন্ট সফল!</h2>
            <p className="mt-1 font-bengali text-sm text-text-secondary">আপনার QR স্ক্যান হয়েছে এবং টোল পরিশোধ হয়ে গেছে।</p>

            <div className="mt-4 space-y-2 rounded-2xl bg-bg p-4 text-sm">
              {paymentDone.vehiclePlate && (
                <div className="flex justify-between">
                  <span className="font-bengali text-text-muted">গাড়ি</span>
                  <span className="font-mono font-bold text-text-primary">{paymentDone.vehiclePlate}</span>
                </div>
              )}
              {paymentDone.bridgeName && (
                <div className="flex justify-between">
                  <span className="font-bengali text-text-muted">ব্রিজ</span>
                  <span className="font-semibold text-text-primary">{paymentDone.bridgeName}</span>
                </div>
              )}
              {paymentDone.amount != null && (
                <div className="flex justify-between">
                  <span className="font-bengali text-text-muted">পরিমাণ</span>
                  <span className="text-lg font-bold text-emerald-600">{formatBDT(paymentDone.amount)}</span>
                </div>
              )}
              {paymentDone.usedAt && (
                <div className="flex justify-between">
                  <span className="font-bengali text-text-muted">সময়</span>
                  <span className="text-text-secondary">{new Date(paymentDone.usedAt).toLocaleString('bn-BD')}</span>
                </div>
              )}
            </div>

            <button
              onClick={() => setPaymentDone(null)}
              className="mt-5 w-full rounded-2xl bg-primary py-3.5 font-bengali font-bold text-white active:scale-[0.98] transition"
            >
              ঠিক আছে
            </button>
          </div>
        </div>
      )}
    </main>
  );
};

