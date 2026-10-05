'use client';

import { useEffect, useState } from 'react';
import { Header } from '@/components/nexos/header';
import { MetricCard } from '@/components/nexos/metric-card';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Users, Users2, GraduationCap, Bell, CalendarCheck, FileText, Loader2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import Link from 'next/link';

function PrioritarioRow({ a }) {
  const prio = a.prioridade || 'media';
  const color = prio === 'alta' ? 'bg-red-100 text-red-700 border-red-200'
    : prio === 'media' ? 'bg-amber-100 text-amber-700 border-amber-200'
    : 'bg-slate-100 text-slate-600 border-slate-200';
  const iniciais = (a.aluno_nome || '').split(' ').map((n) => n[0]).slice(0, 2).join('');
  return (
    <Link href={`/alunos/${a.matricula_aluno}`}
      className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 transition-colors">
      <Avatar className="h-10 w-10">
        <AvatarFallback className="bg-indigo-100 text-indigo-700 text-sm">{iniciais}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-slate-900 truncate">
          {a.aluno_nome} <span className="text-slate-400 font-normal">· {a.turma}</span>
        </div>
        <div className="text-xs text-slate-500 truncate">{a.descricao}</div>
      </div>
      <Badge variant="outline" className={`capitalize ${color}`}>{prio}</Badge>
    </Link>
  );
}

function tipoDot(tipo) {
  const m = {
    nota: 'bg-indigo-500',
    presenca: 'bg-emerald-500',
    observacao: 'bg-purple-500',
    documento: 'bg-sky-500',
  };
  return m[tipo] || 'bg-slate-400';
}

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/dashboard');
        setData(await r.json());
      } finally { setLoading(false); }
    })();
  }, []);

  if (loading || !data) {
    return (
      <div>
        <Header />
        <div className="px-8 pb-8 flex items-center gap-2 text-slate-500 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando dashboard…
        </div>
      </div>
    );
  }

  const m = data.metricas;

  return (
    <div>
      <Header />
      <div className="px-8 pb-8 space-y-6">
        {/* Metrics row */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <MetricCard icon={Users}         label="Alunos matriculados" value={m.alunos}         iconColor="indigo" />
          <MetricCard icon={Users2}        label="Turmas ativas"       value={m.turmas}         iconColor="emerald" />
          <MetricCard icon={GraduationCap} label="Professores ativos"  value={m.professores}    iconColor="violet" />
          <MetricCard icon={Bell}          label="Alertas em aberto"   value={m.alertasAbertos} iconColor="red" />
          <MetricCard icon={CalendarCheck} label="Frequência média"    value={`${m.frequenciaMedia}%`} iconColor="sky" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Alertas prioritários */}
          <Card className="p-5 border-slate-200 shadow-none">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-slate-900">Alertas prioritários</h3>
              <Link href="/alunos" className="text-xs text-indigo-600 hover:underline">Ver todos</Link>
            </div>
            <div className="space-y-1">
              {data.alertasPrioritarios.length === 0 && (
                <div className="text-sm text-slate-500 py-6 text-center">Nenhum alerta no momento.</div>
              )}
              {data.alertasPrioritarios.map((a, i) => <PrioritarioRow key={i} a={a} />)}
            </div>
          </Card>

          {/* Atividades recentes */}
          <Card className="p-5 border-slate-200 shadow-none">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-slate-900">Atividades recentes</h3>
              <a className="text-xs text-indigo-600 hover:underline cursor-pointer">Ver todas</a>
            </div>
            <ul className="space-y-3">
              {data.atividadesRecentes.map((a) => (
                <li key={a.id} className="flex items-start gap-3">
                  <span className={`mt-1.5 w-2 h-2 rounded-full ${tipoDot(a.tipo)}`} />
                  <div className="flex-1">
                    <div className="text-sm text-slate-800">{a.descricao}</div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {new Date(a.data).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        {/* Frequência geral */}
        <Card className="p-5 border-slate-200 shadow-none">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-slate-900">Frequência geral por turma</h3>
            <span className="text-xs text-slate-500">Este mês</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-[220px,1fr] gap-6 items-center">
            <div className="flex flex-col items-center justify-center py-4">
              <div className="relative w-36 h-36 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center shadow-inner">
                <div className="w-28 h-28 rounded-full bg-white flex items-center justify-center">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-slate-900">{m.frequenciaMedia}%</div>
                    <div className="text-xs text-slate-500">média</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.frequenciaPorTurma}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="turma" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    cursor={{ fill: '#f8fafc' }}
                    formatter={(v) => `${v}%`}
                    contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
                  />
                  <Bar dataKey="percentual" fill="#818cf8" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
