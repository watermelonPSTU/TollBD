import { useState } from 'react';
import { Activity, AlertTriangle, ArrowRight, CheckCircle, Clock, Copy, TrendingUp, Users, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Area, AreaChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import toast from 'react-hot-toast';
import { createAnnouncement, getAllTransactions, getDashboardStats } from '@/api/admin.api';
import { getBridges } from '@/api/bridge.api';
import { KPICard, ChartCard } from '@/components/admin';
import { formatBDT, formatDateTime } from '@/utils/format';

const DAY_BN = ['রবি', 'সোম', 'মঙ্গল', 'বুধ', 'বৃহ', 'শুক্র', 'শনি'];
const METHOD_COLORS: Record<string, string> = {
  WALLET: '#1B4FDB', SSLCOMMERZ: '#00A86B', BKASH: '#E2136E', NAGAD: '#EF4444', CARD: '#F5A623'
};

const StatusBadge = ({ status }: { status: string }) => {
  const map: Record<string, string> = {
    SUCCESS: 'bg-emerald-100 text-emerald-700',
    PENDING: 'bg-amber-100 text-amber-700',
    FAILED: 'bg-red-100 text-red-700',
    REFUNDED: 'bg-blue-100 text-blue-700'
  };
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${map[status] ?? 'bg-gray-100 text-gray-600'}`}>{status}</span>;
};

const MethodBadge = ({ method }: { method: string }) => (
  <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-xs font-bold text-gray-600">{method}</span>
);

export const AdminDashboard = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [bTitle, setBTitle] = useState('');
  const [bBody, setBBody] = useState('');

  const { data: stats, isLoading } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: getDashboardStats,
    refetchInterval: 30_000
  });

  const { data: txData } = useQuery({
    queryKey: ['admin-transactions', 'recent'],
    queryFn: () => getAllTransactions({ page: 1, limit: 10 })
  });

  const { data: bridges } = useQuery({ queryKey: ['bridges'], queryFn: () => getBridges() });

  const broadcastMut = useMutation({
    mutationFn: () => createAnnouncement({ title: bTitle, titleBn: bTitle, body: bBody, bodyBn: bBody, type: 'INFO', targetBridgeIds: [] }),
    onSuccess: () => {
      toast.success('ঘোষণা পাঠানো হয়েছে');
      queryClient.invalidateQueries({ queryKey: ['admin-announcements'] });
      setBroadcastOpen(false);
      setBTitle(''); setBBody('');
    }
  });

  // item.date is already a Dhaka-local date string — derive the weekday in UTC
  // so the label never shifts with the viewer's browser timezone
  const chartData = (stats?.weeklyRevenue ?? []).map((item) => ({
    day: DAY_BN[new Date(item.date + 'T00:00:00Z').getUTCDay()],
    date: item.date,
    revenue: item.amountPaisa / 100,
    raw: item.amountPaisa
  }));

  const pieData = Object.entries(stats?.paymentMethodBreakdown ?? {})
    .filter(([, v]) => v > 0)
    .map(([method, count]) => ({ name: method, value: count, color: METHOD_COLORS[method] ?? '#999' }));

  const maintenanceBridges = (bridges ?? []).filter((b) => b.status === 'MAINTENANCE');

  const copy = (text: string) => { navigator.clipboard.writeText(text); toast.success('Copied'); };

  return (
    <div className="space-y-6">
      {/* KPI Row */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <KPICard
          label="Today's Revenue" labelBn="আজকের রাজস্ব"
          value={isLoading ? '...' : formatBDT(stats?.todayRevenuePaisa ?? 0)}
          accentColor="bg-emerald-500" icon={TrendingUp}
        />
        <KPICard
          label="Active Users" labelBn="সক্রিয় ব্যবহারকারী"
          value={isLoading ? '...' : (stats?.totalActiveUsers ?? 0).toLocaleString()}
          accentColor="bg-blue-500" icon={Users}
          onClick={() => navigate('/admin/users')}
        />
        <KPICard
          label="Today Transactions" labelBn="আজকের লেনদেন"
          value={isLoading ? '...' : (stats?.todayTransactionCount ?? 0).toLocaleString()}
          accentColor="bg-amber-500" icon={Activity}
          onClick={() => navigate('/admin/transactions')}
        />
        <KPICard
          label="Pending Vehicles" labelBn="অপেক্ষমান যানবাহন"
          value={isLoading ? '...' : (stats?.pendingVehicleCount ?? 0).toLocaleString()}
          accentColor={stats?.pendingVehicleCount ? 'bg-red-500' : 'bg-gray-400'} icon={Clock}
          onClick={() => navigate('/admin/vehicles')}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        <ChartCard title="Weekly Revenue" titleBn="সাপ্তাহিক রাজস্ব" className="xl:col-span-3" height={240}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#1B4FDB" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#1B4FDB" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={(v) => `৳${v}`} />
              <Tooltip
                contentStyle={{ borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 12 }}
                formatter={(v: unknown) => [`৳${(v as number).toLocaleString()}`, 'Revenue']}
                labelFormatter={(label, payload) => {
                  const d = (payload?.[0]?.payload as { date?: string } | undefined)?.date;
                  return d ? `${label} — ${d}` : String(label);
                }}
              />
              <Area type="monotone" dataKey="revenue" stroke="#1B4FDB" strokeWidth={2.5} fill="url(#revenueGrad)" dot={{ r: 3, fill: '#1B4FDB' }} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Payment Methods" titleBn="পেমেন্ট পদ্ধতি" className="xl:col-span-2" height={240} action={<span />}>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} cx="50%" cy="45%" innerRadius={55} outerRadius={80} dataKey="value" paddingAngle={3}>
                  {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 10, fontSize: 12 }} />
                <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-xs text-gray-600">{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-gray-400">No transaction data yet</div>
          )}
        </ChartCard>
      </div>

      {/* Transactions + Alerts */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Recent transactions */}
        <div className="xl:col-span-2 rounded-2xl bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
            <div>
              <h3 className="font-semibold text-gray-900">Recent Transactions</h3>
              <p className="font-bengali text-xs text-gray-400">সাম্প্রতিক লেনদেন</p>
            </div>
            <button onClick={() => navigate('/admin/transactions')} className="flex items-center gap-1 text-xs font-bold text-primary hover:underline">
              See all <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50/60">
                <tr>
                  {['TxID', 'Bridge', 'Amount', 'Method', 'Status', 'Time'].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {txData?.items.slice(0, 8).map((tx) => (
                  <tr key={tx.id} className="cursor-pointer hover:bg-blue-50/30" onClick={() => navigate('/admin/transactions')}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs text-gray-600">{tx.id.slice(0, 8)}…</span>
                        <button onClick={(e) => { e.stopPropagation(); copy(tx.id); }} className="text-gray-300 hover:text-gray-500">
                          <Copy className="h-3 w-3" />
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">{tx.bridgeName}</td>
                    <td className="px-4 py-3 text-sm font-bold text-gray-900">{formatBDT(tx.amount)}</td>
                    <td className="px-4 py-3"><MethodBadge method={tx.paymentMethod} /></td>
                    <td className="px-4 py-3"><StatusBadge status={tx.status} /></td>
                    <td className="px-4 py-3 text-xs text-gray-400">{formatDateTime(tx.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Alerts panel */}
        <div className="space-y-4">
          {/* Pending vehicles */}
          {(stats?.pendingVehicleCount ?? 0) > 0 && (
            <div
              onClick={() => navigate('/admin/vehicles')}
              className="cursor-pointer rounded-2xl border-l-4 border-red-400 bg-white p-5 shadow-sm hover:shadow-md transition"
            >
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
                <div>
                  <p className="font-bold text-gray-900">{stats?.pendingVehicleCount} Pending Verifications</p>
                  <p className="font-bengali mt-0.5 text-xs text-gray-500">অনুমোদনের অপেক্ষায় যানবাহন</p>
                </div>
              </div>
            </div>
          )}

          {/* Maintenance bridges */}
          {maintenanceBridges.length > 0 && (
            <div className="rounded-2xl border-l-4 border-amber-400 bg-white p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <Zap className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
                <div>
                  <p className="font-bold text-gray-900">{maintenanceBridges.length} Bridge(s) in Maintenance</p>
                  <p className="mt-1 text-xs text-gray-500">{maintenanceBridges.map((b) => b.name).join(', ')}</p>
                </div>
              </div>
            </div>
          )}

          {/* System status */}
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-sm font-bold text-gray-900">System Status</h3>
            <div className="space-y-2.5">
              {[['API Server', true], ['Database', true], ['Email (Resend)', true]].map(([name, ok]) => (
                <div key={String(name)} className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">{String(name)}</span>
                  <div className="flex items-center gap-1.5">
                    <div className={`h-2 w-2 rounded-full ${ok ? 'bg-emerald-400' : 'bg-red-400'}`} />
                    <span className={`text-xs font-semibold ${ok ? 'text-emerald-600' : 'text-red-600'}`}>{ok ? 'Healthy' : 'Down'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick broadcast */}
          <button
            onClick={() => setBroadcastOpen(true)}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 font-bengali text-sm font-bold text-white shadow-sm hover:bg-primary/90 transition"
          >
            <Zap className="h-4 w-4" /> দ্রুত ঘোষণা পাঠান
          </button>

          {(stats?.pendingVehicleCount === 0 && maintenanceBridges.length === 0) && (
            <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <CheckCircle className="h-5 w-5 text-emerald-500" />
              <div>
                <p className="text-sm font-bold text-emerald-800">All systems normal</p>
                <p className="font-bengali text-xs text-emerald-600">সব ঠিক আছে</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Broadcast modal */}
      {broadcastOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="mb-4 font-bold text-gray-900">Quick Announcement</h2>
            <div className="space-y-3">
              <input value={bTitle} onChange={(e) => setBTitle(e.target.value)} placeholder="Title" className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-primary" />
              <textarea value={bBody} onChange={(e) => setBBody(e.target.value)} placeholder="Message body" rows={3} className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-primary" />
            </div>
            <div className="mt-4 flex gap-3">
              <button onClick={() => setBroadcastOpen(false)} className="flex-1 rounded-xl border border-gray-200 py-3 text-sm font-semibold text-gray-600">Cancel</button>
              <button onClick={() => broadcastMut.mutate()} disabled={!bTitle || broadcastMut.isPending} className="flex-1 rounded-xl bg-primary py-3 text-sm font-bold text-white disabled:opacity-50">
                {broadcastMut.isPending ? 'Sending...' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
