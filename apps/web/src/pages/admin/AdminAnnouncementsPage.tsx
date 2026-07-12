import { useState } from 'react';
import { Bell, Info, Megaphone, Plus, TriangleAlert, Wrench, X } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { createAnnouncement, getAnnouncements, Announcement } from '@/api/admin.api';
import { formatDateTime } from '@/utils/format';

type AnnouncementType = 'INFO' | 'WARNING' | 'MAINTENANCE';

const typeConfig: Record<AnnouncementType, { label: string; cls: string; icon: React.ReactNode }> = {
  INFO: { label: 'Info', cls: 'bg-blue-100 text-blue-700 border-blue-200', icon: <Info className="h-4 w-4" /> },
  WARNING: { label: 'Warning', cls: 'bg-amber-100 text-amber-700 border-amber-200', icon: <TriangleAlert className="h-4 w-4" /> },
  MAINTENANCE: { label: 'Maintenance', cls: 'bg-orange-100 text-orange-700 border-orange-200', icon: <Wrench className="h-4 w-4" /> }
};

const EMPTY = { title: '', titleBn: '', body: '', bodyBn: '', type: 'INFO' as AnnouncementType, targetBridgeIds: [] as string[], expiresAt: '' };

export const AdminAnnouncementsPage = () => {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [filterType, setFilterType] = useState<AnnouncementType | ''>('');
  const [form, setForm] = useState(EMPTY);

  const { data: announcements, isLoading } = useQuery({
    queryKey: ['admin-announcements', filterType],
    queryFn: () => getAnnouncements(true)
  });

  const createMut = useMutation({
    mutationFn: () => createAnnouncement({
      title: form.title, titleBn: form.titleBn,
      body: form.body, bodyBn: form.bodyBn,
      type: form.type, targetBridgeIds: form.targetBridgeIds,
      // datetime-local gives "YYYY-MM-DDTHH:mm" — the API expects full ISO 8601
      expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : undefined
    }),
    onSuccess: () => {
      toast.success('Announcement created');
      queryClient.invalidateQueries({ queryKey: ['admin-announcements'] });
      setShowCreate(false);
      setForm(EMPTY);
    },
    onError: () => toast.error('Failed to create announcement')
  });

  const filtered = (announcements ?? []).filter((a) => !filterType || a.type === filterType);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-2">
          {(['', 'INFO', 'WARNING', 'MAINTENANCE'] as Array<AnnouncementType | ''> ).map((t) => (
            <button key={t} onClick={() => setFilterType(t)}
              className={`rounded-xl px-4 py-2 text-xs font-semibold transition ${filterType === t ? 'bg-primary text-white shadow-sm' : 'border border-gray-200 bg-white text-gray-500 hover:text-gray-800'}`}>
              {t || 'All'}
            </button>
          ))}
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary/90 transition">
          <Plus className="h-4 w-4" /> New Announcement
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-white shadow-sm" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl bg-white py-20 shadow-sm">
          <Megaphone className="h-10 w-10 text-gray-300" />
          <p className="mt-3 text-sm text-gray-400">No announcements yet</p>
          <button onClick={() => setShowCreate(true)} className="mt-4 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white">Create first</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {filtered.map((a) => {
            const tc = typeConfig[a.type as AnnouncementType];
            return (
              <div key={a.id} className="rounded-2xl bg-white p-5 shadow-sm hover:shadow-md transition">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border ${tc.cls}`}>
                      {tc.icon}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-gray-900">{a.title}</h3>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${tc.cls}`}>{tc.label}</span>
                        {a.isActive ? (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Active</span>
                        ) : (
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500">Inactive</span>
                        )}
                      </div>
                      {a.titleBn && <p className="font-bengali text-xs text-gray-400">{a.titleBn}</p>}
                    </div>
                  </div>
                </div>
                <p className="mt-3 text-sm text-gray-600 line-clamp-2">{a.body}</p>
                {a.bodyBn && <p className="font-bengali mt-1 text-xs text-gray-400 line-clamp-1">{a.bodyBn}</p>}
                <div className="mt-3 flex items-center justify-between text-xs text-gray-400">
                  <span>Created {formatDateTime(a.createdAt)}</span>
                  {a.expiresAt && <span>Expires {formatDateTime(a.expiresAt)}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-primary" />
                <h2 className="font-bold text-gray-900">New Announcement</h2>
              </div>
              <button onClick={() => setShowCreate(false)}><X className="h-5 w-5 text-gray-400" /></button>
            </div>

            <div className="space-y-3">
              <div className="flex gap-2">
                {(['INFO', 'WARNING', 'MAINTENANCE'] as AnnouncementType[]).map((t) => {
                  const tc = typeConfig[t];
                  return (
                    <button
                      key={t}
                      onClick={() => setForm((f) => ({ ...f, type: t }))}
                      className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border py-2.5 text-xs font-semibold transition ${form.type === t ? tc.cls : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                    >
                      {tc.icon} {tc.label}
                    </button>
                  );
                })}
              </div>
              <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Title (English)" className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-primary" />
              <input value={form.titleBn} onChange={(e) => setForm((f) => ({ ...f, titleBn: e.target.value }))} placeholder="Title (Bengali)" className="font-bengali w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-primary" />
              <textarea value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} placeholder="Body (English)" rows={3} className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-primary" />
              <textarea value={form.bodyBn} onChange={(e) => setForm((f) => ({ ...f, bodyBn: e.target.value }))} placeholder="Body (Bengali)" rows={3} className="font-bengali w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-primary" />
              <div>
                <label className="mb-1 block text-xs text-gray-500">Expires At (optional)</label>
                <input type="datetime-local" value={form.expiresAt} onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-primary" />
              </div>
            </div>

            <div className="mt-5 flex gap-3">
              <button onClick={() => setShowCreate(false)} className="flex-1 rounded-xl border border-gray-200 py-3 text-sm font-semibold text-gray-600">Cancel</button>
              <button onClick={() => createMut.mutate()} disabled={!form.title || !form.body || createMut.isPending}
                className="flex-1 rounded-xl bg-primary py-3 text-sm font-bold text-white disabled:opacity-50">
                {createMut.isPending ? 'Posting…' : 'Post Announcement'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
