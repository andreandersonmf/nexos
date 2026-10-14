'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const carregar = useCallback(async () => {
    try {
      const data = await api('/auth/me');
      setUser(data.usuario);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
    const onUnauthorized = () => {
      setUser(null);
      router.replace('/login');
    };
    window.addEventListener('nexos:unauthorized', onUnauthorized);
    return () => window.removeEventListener('nexos:unauthorized', onUnauthorized);
  }, [carregar, router]);

  const login = useCallback(async (email, senha) => {
    const data = await api('/auth/login', { method: 'POST', body: { email, senha } });
    setUser(data.usuario);
    return data.usuario;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch {
      // sessão pode já estar expirada
    }
    setUser(null);
    router.replace('/login');
  }, [router]);

  const refresh = useCallback(async () => {
    await carregar();
  }, [carregar]);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refresh, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return ctx;
}
