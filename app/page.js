'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function RootPage() {
  const router = useRouter();
  useEffect(() => {
    try {
      const u = typeof window !== 'undefined' ? localStorage.getItem('nexos_user') : null;
      router.replace(u ? '/dashboard' : '/login');
    } catch {
      router.replace('/login');
    }
  }, [router]);
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-slate-500 text-sm">Carregando Nexo's…</div>
    </div>
  );
}
