import { useState } from 'react';
import { AlertTriangle, ArrowLeft, Car, CheckCircle, Copy, ReceiptText, ShieldOff, Trash2, UserCheck, Wallet } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { blockUser, deleteUser, getUserById } from '@/api/admin.api';
import { formatBDT, formatDateTime } from '@/utils/format';

const StatusBadge = ({ status }: { status: string }) => {
  const map: Record<string, string> = {
    ACTIVE: 'bg-emerald-100 text-emerald-700',
    BLOCKED: 'bg-red-100 text-red-700',
    PENDING: 'bg-amber-100 text-amber-700',
    SUCCESS: 'bg-emerald-100 text-emerald-700',
    VERIFIED: 'bg-emerald-100 text-emerald-700',
    REJECTED: 'bg-red-100 text-red-700'
  };
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${map[status] ?? 'bg-gray-100 text-gray-600'}`}>{status}</span>;
};

const InfoRow = ({ label, value }: { label: string; value?: string | null }) => (
  <div className="flex items-start justify-between py-3 border-b border-gray-50 last:border-0">
    <span className="text-sm text-gray-500">{label}</span>
    <span className="text-sm font-semibold text-gray-900 text-right max-w-[60%]">{value ?? '—'}</span>
  </div>
);

const copy = (text: string) => { navigator.clipboard.writeText(text); toast.success('Copied'); };

export const UserDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: user, isLoading } = useQuery({
    queryKey: ['admin-user', id],
    queryFn: () => getUserById(id!),
    enabled: !!id
  });

  const blockMut = useMutation({
    mutationFn: () => blockUser(id!, user?.status === 'BLOCKED' ? 'unblock' : 'block'),
    onSuccess: () => {
      toast.success(`User ${user?.status === 'BLOCKED' ? 'unblocked' : 'blocked'}`);
      queryClient.invalidateQueries({ queryKey: ['admin-user', id] });
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    }
  });

  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteMut = useMutation({
    mutationFn: () => deleteUser(id!),
    onSuccess: () => {
      toast.success('User and all data deleted');
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
      navigate('/admin/users', { replace: true });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Delete failed');
      setConfirmDelete(false);
    }
  });

  if (isLoading) return (
    <div className="flex items-center justify-center py-24">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );

  if (!user) return (
    <div className="flex flex-col items-center justify-center py-24 text-gray-400">
      <p className="text-lg font-bold">User not found</p>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Back */}
      <button onClick={() => navigate('/admin/users')} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition">
        <ArrowLeft className="h-4 w-4" /> Back to Users
      </button>

      {/* Profile hero */}
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-2xl font-bold text-primary">
            {user.fullName?.[0]?.toUpperCase() ?? '?'}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold text-gray-900">{user.fullName}</h1>
              <StatusBadge status={user.status} />
              {user.emailVerified && <span className="flex items-center gap-1 text-xs font-bold text-emerald-600"><CheckCircle className="h-3.5 w-3.5" /> Verified</span>}
            </div>
            <div className="mt-1.5 flex items-center gap-2 flex-wrap">
              <span className="text-sm text-gray-500">{user.email}</span>
              <button onClick={() => copy(user.id)} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600">
                <Copy className="h-3 w-3" /> {user.id.slice(0, 12)}…
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => blockMut.mutate()}
              disabled={blockMut.isPending}
              className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white transition disabled:opacity-50 ${user.status === 'BLOCKED' ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-red-500 hover:bg-red-600'}`}
            >
              {user.status === 'BLOCKED' ? <><UserCheck className="h-4 w-4" /> Unblock</> : <><ShieldOff className="h-4 w-4" /> Block User</>}
            </button>
            {user.role !== 'ADMIN' && (
              <button
                onClick={() => setConfirmDelete(true)}
                disabled={deleteMut.isPending}
                className="flex items-center gap-2 rounded-xl border border-red-200 bg-white px-5 py-2.5 text-sm font-bold text-red-600 transition hover:bg-red-50 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" /> Delete User
              </button>
            )}
          </div>
        </div>

        {/* Stats row */}
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { icon: Wallet, label: 'Wallet Balance', value: formatBDT(user.wallet?.balance ?? 0), color: 'text-emerald-600 bg-emerald-50' },
            { icon: Car, label: 'Vehicles', value: (user._count?.vehicles ?? 0).toString(), color: 'text-blue-600 bg-blue-50' },
            { icon: ReceiptText, label: 'Transactions', value: (user._count?.transactions ?? 0).toString(), color: 'text-amber-600 bg-amber-50' },
            { icon: CheckCircle, label: 'Role', value: user.role, color: 'text-purple-600 bg-purple-50' },
          ].map(({ icon: Icon, label, value, color }) => (
            <div key={label} className="flex items-center gap-3 rounded-xl bg-gray-50 p-4">
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${color}`}>
                <Icon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs text-gray-500">{label}</p>
                <p className="font-bold text-gray-900">{value}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Personal info */}
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="mb-3 font-bold text-gray-900">Personal Information</h2>
          <InfoRow label="Phone" value={user.phone} />
          <InfoRow label="Division" value={user.division} />
          <InfoRow label="District" value={user.district} />
          <InfoRow label="NID" value={user.nidNumber ? `****${user.nidNumber.slice(-4)}` : null} />
          <InfoRow label="Emergency Contact" value={user.emergencyContact} />
          <InfoRow label="Joined" value={formatDateTime(user.createdAt)} />
          <InfoRow label="Last Updated" value={formatDateTime(user.updatedAt)} />
        </div>

        {/* Recent transactions */}
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="mb-3 font-bold text-gray-900">Recent Transactions</h2>
          {user.transactions.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">No transactions yet</p>
          ) : (
            <div className="space-y-2">
              {user.transactions.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{tx.bridgeName}</p>
                    <p className="text-xs text-gray-400">{tx.vehiclePlate} · {formatDateTime(tx.createdAt)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-gray-900">{formatBDT(tx.amount)}</p>
                    <StatusBadge status={tx.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Vehicles */}
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 font-bold text-gray-900">Registered Vehicles</h2>
        {user.vehicles.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">No vehicles registered</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {user.vehicles.map((v) => (
              <div key={v.id} className="flex items-center gap-3 rounded-xl border border-gray-100 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                  <Car className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-900 truncate">{v.registrationNumber}</p>
                  <p className="text-xs text-gray-500">{v.vehicleType} · {v.vehicleCategory}</p>
                </div>
                <StatusBadge status={v.status} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-red-100">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <h2 className="font-bold text-gray-900">Delete this user permanently?</h2>
                <p className="mt-1 text-sm text-gray-500">
                  <strong>{user.fullName}</strong> ({user.email}) — this removes the user along with{' '}
                  <strong>{user._count?.vehicles ?? 0} vehicles</strong>, <strong>{user._count?.transactions ?? 0} transactions</strong>,
                  wallet balance and QR passes. This cannot be undone.
                </p>
                <p className="font-bengali mt-2 text-xs text-red-500">সতর্কতা: user-এর সব data চিরতরে মুছে যাবে!</p>
              </div>
            </div>
            <div className="mt-5 flex gap-3">
              <button onClick={() => setConfirmDelete(false)} className="flex-1 rounded-xl border border-gray-200 py-3 text-sm font-semibold text-gray-600">Cancel</button>
              <button
                onClick={() => deleteMut.mutate()}
                disabled={deleteMut.isPending}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 py-3 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" /> {deleteMut.isPending ? 'Deleting…' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
