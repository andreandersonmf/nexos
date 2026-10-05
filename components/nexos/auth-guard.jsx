'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export function AuthGuard({ children }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const u = localStorage.getItem('nexos_user');
      if (!u) {
        router.replace('/login');
        return;
      }
      setReady(true);
    } catch {
      router.replace('/login');
    }
  }, [router]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-sm text-slate-500">
        Carregando…
      </div>
    );
  }
  return children;
}
