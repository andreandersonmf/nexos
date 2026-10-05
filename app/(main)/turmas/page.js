'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Header } from '@/components/nexos/header';
import { Card } from '@/components/ui/card';
import { Users2, Loader2, ArrowUpRight } from 'lucide-react';

export default function TurmasPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/turmas').then((r) => r.json())
      .then((d) => setItems(d.items || []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <Header title="Turmas" subtitle="Visão geral das turmas ativas na escola." showSearch={false} />
      <div className="px-8 pb-8">
        {loading ? (
          <div className="flex items-center gap-2 text-slate-500 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando turmas…
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((t) => (
              <Link key={t.id} href={`/turmas/${t.id}`}>
                <Card className="p-5 border-slate-200 shadow-none hover:shadow-sm hover:border-indigo-300 transition-all cursor-pointer group">
                  <div className="flex items-start justify-between">
                    <div className="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                      <Users2 className="w-5 h-5" />
                    </div>
                    <ArrowUpRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-500 transition-colors" />
                  </div>
                  <div className="mt-4">
                    <div className="text-lg font-semibold text-slate-900">{t.nome}</div>
                    <div className="text-xs text-slate-500 mt-0.5">Turno {t.turno} · Ano letivo {t.ano_letivo}</div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
                    <div className="text-xs text-slate-500">Alunos matriculados</div>
                    <div className="text-sm font-semibold text-slate-900">{t.totalAlunos}</div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
