'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Header } from '@/components/nexos/header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Loader2, FileText, Printer } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

function notaColor(v) {
  if (v == null) return 'text-slate-300';
  if (v < 6) return 'text-red-600';
  if (v < 7.5) return 'text-amber-600';
  return 'text-emerald-600';
}

export default function AlunoDetailPage() {
  const { matricula } = useParams();
  const router = useRouter();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`/api/alunos/${matricula}`);
        setData(await r.json());
      } finally { setLoading(false); }
    })();
  }, [matricula]);

  if (loading || !data?.aluno) {
    return (
      <div>
        <Header title=" " subtitle=" " showSearch={false} />
        <div className="px-8 flex items-center gap-2 text-slate-500 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando aluno…
        </div>
      </div>
    );
  }

  const { aluno, notas, historico, frequencia, observacoes } = data;
  const iniciais = aluno.nome.split(' ').map((n) => n[0]).slice(0, 2).join('');

  return (
    <div>
      <Header title={`${aluno.nome} — ${aluno.turma}`}
        subtitle="Visão completa de notas, frequência, observações e documentos." showSearch={false} />

      <div className="px-8 pb-8">
        <div className="flex items-center justify-between mb-4">
          <Button variant="ghost" onClick={() => router.push('/alunos')} className="text-slate-600">
            <ArrowLeft className="w-4 h-4 mr-2" /> Voltar para lista
          </Button>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => window.open(`/boletim/${aluno.matricula}`, '_blank')}
              className="border-indigo-200 text-indigo-700 hover:bg-indigo-50">
              <Printer className="w-4 h-4 mr-2" /> Exportar boletim
            </Button>
            <Avatar className="h-10 w-10">
              <AvatarFallback className="bg-indigo-100 text-indigo-700">{iniciais}</AvatarFallback>
            </Avatar>
            <div className="text-right">
              <div className="text-sm font-medium text-slate-900">{aluno.matricula}</div>
              <div className="text-xs text-slate-500">{aluno.status}</div>
            </div>
          </div>
        </div>

        <Card className="border-slate-200 shadow-none">
          <Tabs defaultValue="notas" className="w-full">
            <div className="border-b border-slate-200 px-5 pt-4">
              <TabsList className="bg-transparent p-0 h-auto">
                <TabsTrigger value="notas" className="data-[state=active]:border-indigo-600 data-[state=active]:text-indigo-700 data-[state=active]:shadow-none border-b-2 border-transparent rounded-none px-4 pb-3 pt-1">Notas</TabsTrigger>
                <TabsTrigger value="frequencia" className="data-[state=active]:border-indigo-600 data-[state=active]:text-indigo-700 data-[state=active]:shadow-none border-b-2 border-transparent rounded-none px-4 pb-3 pt-1">Frequência</TabsTrigger>
                <TabsTrigger value="observacoes" className="data-[state=active]:border-indigo-600 data-[state=active]:text-indigo-700 data-[state=active]:shadow-none border-b-2 border-transparent rounded-none px-4 pb-3 pt-1">Observações</TabsTrigger>
                <TabsTrigger value="documentos" className="data-[state=active]:border-indigo-600 data-[state=active]:text-indigo-700 data-[state=active]:shadow-none border-b-2 border-transparent rounded-none px-4 pb-3 pt-1">Documentos</TabsTrigger>
              </TabsList>
            </div>

            {/* NOTAS */}
            <TabsContent value="notas" className="p-6 space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {notas.map((n) => (
                  <Card key={n.disciplina} className="p-4 border-slate-200 shadow-none">
                    <div className="text-xs text-slate-500 mb-1">{n.disciplina}</div>
                    <div className={`text-3xl font-semibold ${notaColor(n.media)}`}>
                      {n.media != null ? n.media.toFixed(1).replace('.', ',') : '—'}
                    </div>
                    <div className="text-xs text-slate-400 mt-1">Média geral</div>
                  </Card>
                ))}
              </div>

              <div>
                <div className="text-sm font-semibold text-slate-900 mb-3">Histórico de notas</div>
                <div className="rounded-lg border border-slate-200 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50 hover:bg-slate-50">
                        <TableHead>Bimestre</TableHead>
                        {notas.map((n) => <TableHead key={n.disciplina}>{n.disciplina}</TableHead>)}
                        <TableHead>Média</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {historico.map((row) => (
                        <TableRow key={row.bimestre}>
                          <TableCell className="font-medium">{row.bimestre}</TableCell>
                          {notas.map((n) => (
                            <TableCell key={n.disciplina} className={notaColor(row[n.disciplina])}>
                              {row[n.disciplina] != null ? row[n.disciplina].toFixed(1).replace('.', ',') : '—'}
                            </TableCell>
                          ))}
                          <TableCell className={`font-semibold ${notaColor(row['Média'])}`}>
                            {row['Média'] != null ? row['Média'].toFixed(1).replace('.', ',') : '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </TabsContent>

            {/* FREQUÊNCIA */}
            <TabsContent value="frequencia" className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-[220px,120px,120px,1fr] gap-6 items-center">
                <div className="flex flex-col items-center">
                  <div className="relative w-32 h-32 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
                    <div className="w-24 h-24 rounded-full bg-white flex items-center justify-center">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-slate-900">{frequencia.percentual}%</div>
                        <div className="text-[10px] text-slate-500">Presente</div>
                      </div>
                    </div>
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Faltas</div>
                  <div className="text-3xl font-semibold text-slate-900">{frequencia.faltas}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Total de aulas</div>
                  <div className="text-3xl font-semibold text-slate-900">{frequencia.totalAulas}</div>
                </div>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={frequencia.chart}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="mes" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                      <Tooltip formatter={(v) => `${v} faltas`} contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }} />
                      <Bar dataKey="faltas" fill="#a78bfa" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </TabsContent>

            {/* OBSERVAÇÕES */}
            <TabsContent value="observacoes" className="p-6">
              <div className="text-sm font-semibold text-slate-900 mb-3">Observações pedagógicas</div>
              <ul className="space-y-3">
                {observacoes.length === 0 && (
                  <li className="text-sm text-slate-500">Nenhuma observação registrada.</li>
                )}
                {observacoes.map((o, i) => (
                  <li key={i} className="flex gap-3 p-3 rounded-lg border border-slate-200">
                    <div className={`w-1 self-stretch rounded-full ${o.tipo === 'alerta' ? 'bg-red-400' : 'bg-indigo-400'}`} />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <div className="text-xs text-slate-500">
                          {new Date(o.data).toLocaleDateString('pt-BR')} · {o.professor}
                        </div>
                      </div>
                      <div className="text-sm text-slate-800 mt-1">{o.texto}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </TabsContent>

            {/* DOCUMENTOS */}
            <TabsContent value="documentos" className="p-6">
              <div className="text-sm text-slate-500 flex items-center gap-2">
                <FileText className="w-4 h-4" /> Nenhum documento publicado para este aluno ainda.
              </div>
            </TabsContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
}
