'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Header } from '@/components/nexos/header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MetricCard } from '@/components/nexos/metric-card';
import { ArrowLeft, Users, CalendarCheck, TrendingUp, Bell, Loader2 } from 'lucide-react';

function notaColor(v) {
  if (v == null) return 'text-slate-300';
  if (v < 6) return 'text-red-600';
  if (v < 7.5) return 'text-amber-600';
  return 'text-emerald-600';
}
function freqColor(v) {
  if (v < 75) return 'text-red-600';
  if (v < 85) return 'text-amber-600';
  return 'text-emerald-600';
}

export default function TurmaDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/turmas/${id}`).then((r) => r.json())
      .then(setData).finally(() => setLoading(false));
  }, [id]);

  if (loading || !data?.turma) {
    return (
      <div>
        <Header title=" " subtitle=" " showSearch={false} />
        <div className="px-8 flex items-center gap-2 text-slate-500 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando turma…
        </div>
      </div>
    );
  }

  const { turma, alunos, metricas } = data;

  return (
    <div>
      <Header title={`Turma ${turma.nome}`}
        subtitle={`${turma.turno} · Ano letivo ${turma.ano_letivo}`} showSearch={false} />

      <div className="px-8 pb-8 space-y-6">
        <Button variant="ghost" onClick={() => router.push('/turmas')} className="text-slate-600">
          <ArrowLeft className="w-4 h-4 mr-2" /> Voltar para turmas
        </Button>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard icon={Users}         label="Alunos"           value={metricas.totalAlunos}                                                     iconColor="indigo" />
          <MetricCard icon={TrendingUp}    label="Média geral"      value={metricas.mediaGeral != null ? metricas.mediaGeral.toFixed(1).replace('.', ',') : '—'} iconColor="emerald" />
          <MetricCard icon={CalendarCheck} label="Frequência média" value={`${metricas.freqMedia}%`}                                                 iconColor="sky" />
          <MetricCard icon={Bell}          label="Alertas em aberto" value={metricas.totalAlertas}                                                   iconColor="red" />
        </div>

        <Card className="border-slate-200 shadow-none">
          <div className="p-5 border-b border-slate-100">
            <h3 className="text-base font-semibold text-slate-900">Alunos da turma</h3>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50 hover:bg-slate-50">
                <TableHead>Nome</TableHead>
                <TableHead className="text-right">Média</TableHead>
                <TableHead className="text-right">Frequência</TableHead>
                <TableHead className="text-right">Alertas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {alunos.map((a) => {
                const iniciais = a.nome.split(' ').map((n) => n[0]).slice(0, 2).join('');
                return (
                  <TableRow key={a.matricula} className="hover:bg-slate-50">
                    <TableCell className="py-3">
                      <Link href={`/alunos/${a.matricula}`} className="flex items-center gap-3 group">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="bg-indigo-100 text-indigo-700 text-xs">{iniciais}</AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="text-sm font-medium text-slate-900 group-hover:text-indigo-700">{a.nome}</div>
                          <div className="text-xs text-slate-400">{a.matricula}</div>
                        </div>
                      </Link>
                    </TableCell>
                    <TableCell className={`text-right font-medium ${notaColor(a.media)}`}>
                      {a.media != null ? a.media.toFixed(1).replace('.', ',') : '—'}
                    </TableCell>
                    <TableCell className={`text-right font-medium ${freqColor(a.freqPct)}`}>
                      {a.freqPct}%
                    </TableCell>
                    <TableCell className="text-right">
                      {a.alertas > 0
                        ? <Badge className="bg-red-100 text-red-700 hover:bg-red-100 border-red-200">{a.alertas}</Badge>
                        : <span className="text-slate-300 text-sm">—</span>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  );
}
