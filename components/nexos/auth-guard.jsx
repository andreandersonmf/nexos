'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from './auth-provider';

export function AuthGuard({ children }) {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [esperando, setEsperando] = useState(true);

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.replace('/login');
      } else {
        const caminho = window.location.pathname;
        if (user.perfil === 'RESPONSAVEL') {
          const permitidos = ['/dashboard', '/frequencia', '/desempenho', '/documentos', '/comunicados'];
          if (!permitidos.some((p) => caminho === p || caminho.startsWith(`${p}/`))) {
            router.replace('/dashboard');
            return;
          }
        }
        setEsperando(false);
      }
    }
  }, [loading, user, router]);

  // Força a troca da senha temporária antes de qualquer funcionalidade
  useEffect(() => {
    if (user?.senha_temporaria && !window.location.pathname.startsWith('/primeiro-acesso')) {
      router.replace('/primeiro-acesso');
    }
  }, [user, router]);

  if (loading || esperando || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-sm text-slate-500">
        Carregando…
      </div>
    );
  }
  return children;
}
