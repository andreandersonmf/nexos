'use client';

import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Search, Bell } from 'lucide-react';

export function Header({ title, subtitle, showSearch = true }) {
  const [user, setUser] = useState(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem('nexos_user');
      if (raw) setUser(JSON.parse(raw));
    } catch {}
  }, []);

  const nome = user?.nome?.split(' ')[0] || '';
  const defaultTitle = nome ? `Olá, ${nome}! 👋` : 'Olá!';
  const defaultSubtitle = 'Veja o que está acontecendo na escola hoje.';

  return (
    <header className="flex items-center justify-between px-8 py-6 bg-slate-50">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">
          {title || defaultTitle}
        </h1>
        {(subtitle || !title) && (
          <p className="text-sm text-slate-500 mt-1">{subtitle || defaultSubtitle}</p>
        )}
      </div>
      <div className="flex items-center gap-3">
        {showSearch && (
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Buscar aluno, turma ou documento…"
              className="pl-9 w-80 bg-white border-slate-200"
            />
          </div>
        )}
        <button className="relative w-10 h-10 rounded-lg bg-white border border-slate-200 flex items-center justify-center hover:bg-slate-50">
          <Bell className="w-4 h-4 text-slate-600" />
          <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full" />
        </button>
      </div>
    </header>
  );
}
