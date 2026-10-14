'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Header } from '@/components/nexos/header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  ArrowLeft, Loader2, FileText, Printer, Download, Pencil, AlertTriangle, UserRound,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useAuth } from '@/components/nexos/auth-provider';
import { api } from '@/lib/client/api';

function notaColor(v) {
  if (v == null) return 'text-slate-300';
  if (v < 6) return 'text-red-600';
  if (v < 7.5) return 'text-amber-600';
  return 'text-emerald-600';
}

function notaFmt(v) { return v != null ? v.toFixed(1).replace('.', ',') : '—'; }

const PRIORIDADE_LABEL = { alta: 'Alta', media: 'Média', baixa: 'Baixa' };

export default function AlunoDetailPage() {
  const { matricula } = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const ehEquipe = ['ADMIN', 'COORDENADOR', 'PROFESSOR'].includes(user?.perfil);
  const podeEditar = user?.perfil === 'ADMIN' || user?.perfil === 'COORDENADOR';

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');

  const [editAberto, setEditAberto] = useState(false);
  const [turmas, setTurmas] = useState([]);
  const [form, setForm] = useState({});
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const d = await api(`/alunos/${matricula}`);
        setData(d);
      } catch (e) {
        setErro(e.message || 'Não foi possível carregar o aluno.');
      } finally { setLoading(false); }
    })();
  }, [matricula]);

  const abrirEdicao = async () => {
    setForm({
      nome: data.aluno.nome,
      turma_id: String(data.aluno.turma_id),
      data_nascimento: data.aluno.data_nascimento?.slice(0, 10) || '',
      email: data.aluno.email || '',
      status: data.aluno.status || 'ATIVO',
    });
    setEditAberto(true);
    try {
      const t = await api('/turmas');
      setTurmas(t.items || []);
    } catch {
      setTurmas([]);
    }
  };

  const salvarEdicao = async () => {
    setSalvando(true);
    setErro('');
    try {
      const d = await api(`/alunos/${matricula}`, {
        method: 'PUT',
        body: {
          nome: form.nome,
          turma_id: Number(form.turma_id),
          data_nascimento: form.data_nascimento || null,
          email: form.email || null,
          status: form.status,
        },
      });
      setEditAberto(false);
      setData({ ...data, aluno: { ...data.aluno, ...d.aluno } });
    } catch (e) {
      setErro(e.message || 'Não foi possível salvar as alterações.');
    } finally {
      setSalvando(false);
    }
  };

  if (loading) {
    return (
      <div>
        <Header title=" " subtitle=" " showSearch={false} />
        <div className="px-8 flex items-center gap-2 text-slate-500 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando aluno…
        </div>
      </div>
    );
  }

  if (erro && !data) {
    return (
      <div>
        <Header title="Aluno" subtitle=" " showSearch={false} />
        <div className="px-8">
          <Card className="p-8 text-center">
            <div className="text-sm text-red-600 mb-4">{erro}</div>
            <Button variant="outline" onClick={() => router.push('/alunos')}>
              <ArrowLeft className="w-4 h-4 mr-2" /> Voltar para lista
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  const { aluno, notas, historico, frequencia, observacoes, alertas, documentos, responsaveis } = data;
  const iniciais = aluno.nome.split(' ').map((n) => n[0]).slice(0, 2).join('');
  const freqPct = frequencia.percentual != null ? `${frequencia.percentual}%` : '—';

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
            {podeEditar && (
              <Button variant="outline" onClick={abrirEdicao} className="border-slate-200 text-slate-700 hover:bg-slate-50">
                <Pencil className="w-4 h-4 mr-2" /> Editar cadastro
              </Button>
            )}
            {ehEquipe && (
              <Button variant="outline" onClick={() => window.open(`/boletim/${aluno.matricula}`, '_blank')}
                className="border-indigo-200 text-indigo-700 hover:bg-indigo-50">
                <Printer className="w-4 h-4 mr-2" /> Exportar boletim
              </Button>
            )}
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
                {ehEquipe && (
                  <TabsTrigger value="observacoes" className="data-[state=active]:border-indigo-600 data-[state=active]:text-indigo-700 data-[state=active]:shadow-none border-b-2 border-transparent rounded-none px-4 pb-3 pt-1">Observações</TabsTrigger>
                )}
                <TabsTrigger value="documentos" className="data-[state=active]:border-indigo-600 data-[state=active]:text-indigo-700 data-[state=active]:shadow-none border-b-2 border-transparent rounded-none px-4 pb-3 pt-1">Documentos</TabsTrigger>
              </TabsList>
            </div>

            {/* NOTAS */}
            <TabsContent value="notas" className="p-6 space-y-6">
              {notas.length === 0 ? (
                <div className="text-sm text-slate-500">Nenhuma nota registrada para este aluno.</div>
              ) : (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {notas.map((n) => (
                      <Card key={n.disciplina} className="p-4 border-slate-200 shadow-none">
                        <div className="text-xs text-slate-500 mb-1">{n.disciplina}</div>
                        <div className={`text-3xl font-semibold ${notaColor(n.media)}`}>{notaFmt(n.media)}</div>
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
                                  {notaFmt(row[n.disciplina])}
                                </TableCell>
                              ))}
                              <TableCell className={`font-semibold ${notaColor(row['Média'])}`}>{notaFmt(row['Média'])}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </>
              )}
            </TabsContent>

            {/* FREQUÊNCIA */}
            <TabsContent value="frequencia" className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-[220px,120px,120px,1fr] gap-6 items-center">
                <div className="flex flex-col items-center">
                  <div className="relative w-32 h-32 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
                    <div className="w-24 h-24 rounded-full bg-white flex items-center justify-center">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-slate-900">{freqPct}</div>
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
                  {frequencia.chart.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-sm text-slate-400">
                      Sem registros de falta no período.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={frequencia.chart}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                        <XAxis dataKey="mes" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} allowDecimals={false} />
                        <Tooltip formatter={(v) => `${v} faltas`} contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }} />
                        <Bar dataKey="faltas" fill="#a78bfa" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            </TabsContent>

            {/* OBSERVAÇÕES (equipe apenas) */}
            {ehEquipe && (
              <TabsContent value="observacoes" className="p-6 space-y-6">
                {alertas.length > 0 && (
                  <div>
                    <div className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-500" /> Alertas ativos
                    </div>
                    <ul className="space-y-2">
                      {alertas.map((a) => (
                        <li key={a.id} className="flex items-center gap-3 p-3 rounded-lg border border-amber-200 bg-amber-50/50">
                          <Badge className={a.prioridade === 'alta' ? 'bg-red-100 text-red-700' : a.prioridade === 'media' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700'}>
                            {PRIORIDADE_LABEL[a.prioridade] || a.prioridade}
                          </Badge>
                          <div className="text-sm text-slate-800">{a.mensagem}</div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div>
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
                </div>

                {responsaveis.length > 0 && (
                  <div>
                    <div className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                      <UserRound className="w-4 h-4 text-slate-400" /> Responsáveis
                    </div>
                    <ul className="space-y-2">
                      {responsaveis.map((r, i) => (
                        <li key={i} className="p-3 rounded-lg border border-slate-200 text-sm">
                          <div className="font-medium text-slate-900">{r.nome}</div>
                          <div className="text-xs text-slate-500">{r.parentesco || 'Responsável'} · {r.email || 'sem e-mail'} · {r.telefone || 'sem telefone'}</div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </TabsContent>
            )}

            {/* DOCUMENTOS */}
            <TabsContent value="documentos" className="p-6">
              {documentos.length === 0 ? (
                <div className="text-sm text-slate-500 flex items-center gap-2">
                  <FileText className="w-4 h-4" /> Nenhum documento publicado para este aluno ainda.
                </div>
              ) : (
                <ul className="space-y-2">
                  {documentos.map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-slate-200">
                      <div className="flex items-center gap-3">
                        <FileText className="w-4 h-4 text-indigo-500" />
                        <div>
                          <div className="text-sm font-medium text-slate-900">{d.titulo}</div>
                          <div className="text-xs text-slate-500">
                            {new Date(d.data).toLocaleDateString('pt-BR')} · {d.categoria || 'Geral'}
                          </div>
                        </div>
                      </div>
                      <Button variant="outline" size="sm" asChild>
                        <a href={`/api/documentos/${d.id}/download`} target="_blank" rel="noreferrer">
                          <Download className="w-4 h-4 mr-1" /> Baixar
                        </a>
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>
          </Tabs>
        </Card>
      </div>

      <Dialog open={editAberto} onOpenChange={setEditAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar cadastro</DialogTitle>
            <DialogDescription>Atualize os dados do aluno. A matrícula não pode ser alterada.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="edit-nome">Nome completo</Label>
              <Input id="edit-nome" value={form.nome || ''} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Turma</Label>
                <Select value={form.turma_id || ''} onValueChange={(v) => setForm({ ...form, turma_id: v })}>
                  <SelectTrigger className="w-full bg-white">
                    <SelectValue placeholder="Turma" />
                  </SelectTrigger>
                  <SelectContent>
                    {turmas.map((t) => (
                      <SelectItem key={t.id} value={String(t.id)}>{t.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Status</Label>
                <Select value={form.status || 'ATIVO'} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger className="w-full bg-white">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ATIVO">Ativo</SelectItem>
                    <SelectItem value="INATIVO">Inativo</SelectItem>
                    <SelectItem value="TRANSFERIDO">Transferido</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-nascimento">Data de nascimento</Label>
              <Input id="edit-nascimento" type="date" value={form.data_nascimento || ''} onChange={(e) => setForm({ ...form, data_nascimento: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-email">E-mail</Label>
              <Input id="edit-email" type="email" value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            {erro && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{erro}</div>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditAberto(false)} disabled={salvando}>Cancelar</Button>
            <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={salvarEdicao} disabled={salvando || !form.nome?.trim()}>
              {salvando && <Loader2 className="w-4 h-4 animate-spin mr-1" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
