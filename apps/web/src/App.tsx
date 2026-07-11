import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { AppRouter } from './router';
import { useUIStore } from './store/uiStore';

const queryClient = new QueryClient();

export const App = () => {
  const isOnline = useUIStore((state) => state.isOnline);
  const setOnline = useUIStore((state) => state.setOnline);

  useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine);
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);
    return () => {
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
    };
  }, [setOnline]);

  return (
    <QueryClientProvider client={queryClient}>
      {!isOnline ? (
        <div className="fixed inset-x-0 top-0 z-[60] bg-red-600 px-4 py-2 text-center font-bengali text-xs font-bold text-white">
          ইন্টারনেট সংযোগ নেই
        </div>
      ) : null}
      <AppRouter />
      <Toaster position="bottom-center" />
    </QueryClientProvider>
  );
};
// sh