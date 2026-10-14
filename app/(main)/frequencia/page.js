'use client';

import { useEffect, useState } from 'react';
import { Header } from '@/components/nexos/header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CalendarCheck, Loader2, CheckCircle2, XCircle, Save } from 'lucide-react';
import { useAuth } from '@/components/nexos/auth-provider';
import { api } from '@/lib/client/api';

function freqColor(v) {
  if (v == null) return 'text-slate-400';
  if (v < 75) return 'text-red-600';
  if (v < 85) return 'text-amber-600';
  return 'text-emerald-600';
}

export default function FrequenciaPage() {
  const { user } = useAuth();
  const ehEquipe = ['ADMIN', 'COORDENADOR', 'PROFESSOR'].includes(user?.perfil);
  const ehAluno = user?.perfil === 'ALUNO';

  const [turmas, setTurmas] = useState([]);
  const [turmaId, setTurmaId] = useState('');
  const [alunosTurma, setAlunosTurma] = useState([]);

  // registro em lote
  const [dataAula, setDataAula] = useState(new Date().toISOString().slice(0, 10));
  const [disciplinaId, setDisciplinaId] = useState('');
  const [disciplinas, setDisciplinas] = useState([]);
  const [presencas, setPresencas] = useState({}); // matricula -> {presente, justificativa}
  const [salvando, setSalvando] = useState(false);
  const [msgSucesso, setMsgSucesso] = useState('');
  const [erro, setErro] = useState('');

  // resumo
  const [resumo, setResumo] = useState([]);
  const [resumoLoading, setResumoLoading] = useState(true);

  // registros
  const [registros, setRegistros] = useState([]);
  const [registrosLoading, setRegistrosLoading] = useState(true);

  const carregarTurmas = async () => {
    try {
      const d = await api('/turmas');
      let lista = d.items || [];
      if (user?.perfil === 'PROFESSOR') lista = lista.filter((t) => (user.turmas || []).includes(Number(t.id)));
      setTurmas(lista);
      if (lista.length && !turmaId) setTurmaId(String(lista[0].id));
    } catch { /* sem permissão */ }
  };

  const carregarAlunosTurma = async (tid) => {
    if (!tid) { setAlunosTurma([]); return; }
    try {
      const d = await api(`/alunos?turma_id=${tid}`);
      const lista = d.items || [];
      setAlunosTurma(lista);
      const p = {};
      for (const a of lista) p[a.matricula] = { presente: true, justificativa: '' };
      setPresencas(p);
    } catch {
      setAlunosTurma([]);
    }
  };

  const carregarResumo = async () => {
    setResumoLoading(true);
    try {
      const params = turmaId && ehEquipe ? `?turma_id=${turmaId}` : '';
      const d = await api(`/frequencia/resumo${params}`);
      setResumo(d.items || []);
    } finally {
      setResumoLoading(false);
    }
  };

  const carregarRegistros = async () => {
    setRegistrosLoading(true);
    try {
      const params = turmaId && ehEquipe ? `?turma_id=${turmaId}&limite=300` : '?limite=300';
      const d = await api(`/frequencia${params}`);
      setRegistros(d.items || []);
    } finally {
      setRegistrosLoading(false);
    }
  };

  useEffect(() => { carregarTurmas(); }, []);
  useEffect(() => {
    if (!turmaId) return;
    carregarAlunosTurma(turmaId);
    if (ehEquipe) { carregarResumo(); carregarRegistros(); }
  }, [turmaId]);

  useEffect(() => {
    if (ehAluno) { carregarResumo(); carregarRegistros(); }
  }, []);

  useEffect(() => {
    if (!ehEquipe) return;
    (async () => {
      try {
        const r = await fetch('/api/desempenho/resumo');
        const d = await r.json();
        setDisciplinas((d.porDisciplina || []).filter((x) => x.disciplina_id != null));
      } catch { /* opcional */ }
    })();
  }, [ehEquipe]);

  const salvarLote = async () => {
    setSalvando(true);
    setErro('');
    setMsgSucesso('');
    try {
      const registros = Object.entries(presencas).map(([matricula_aluno, r]) => ({
        matricula_aluno,
        presente: r.presente,
        justificativa: r.justificativa || null,
      }));
      const d = await api('/frequencia', {
        method: 'POST',
        body: {
          turma_id: Number(turmaId),
          data_aula: dataAula,
          disciplina_id: disciplinaId && disciplinaId !== '__todas' ? Number(disciplinaId) : null,
          registros,
        },
      });
      setMsgSucesso(`Frequência registrada para ${d.salvos} aluno(s).`);
      carregarResumo();
      carregarRegistros();
    } catch (e) {
      setErro(e.message || 'Não foi possível registrar a frequência.');
    } finally {
      setSalvando(false);
    }
  };

  const togglePresenca = (matricula) => {
    setPresencas((p) => ({
      ...p,
      [matricula]: { ...p[matricula], presente: !p[matricula]?.presente },
    }));
  };

  return (
    <div>
      <Header title="Frequência" subtitle={ehAluno ? 'Acompanhe sua frequência nas aulas.' : 'Registre e acompanhe a frequência das turmas.'} showSearch={false} />
      <div className="px-8 pb-8">
        <Card className="border-slate-200 shadow-none">
          <Tabs defaultValue={ehEquipe ? 'registrar' : 'resumo'} className="w-full">
            <div className="border-b border-slate-200 px-5 pt-4 flex items-center justify-between">
              <TabsList className="bg-transparent p-0 h-auto">
                {ehEquipe && (
                  <TabsTrigger value="registrar" className="data-[state=active]:border-indigo-600 data-[state=active]:text-indigo-700 data-[state=active]:shadow-none border-b-2 border-transparent rounded-none px-4 pb-3 pt-1">Registrar</TabsTrigger>
                )}
                <TabsTrigger value="resumo" className="data-[state=active]:border-indigo-600 data-[state=active]:text-indigo-700 data-[state=active]:shadow-none border-b-2 border-transparent rounded-none px-4 pb-3 pt-1">Resumo</TabsTrigger>
                <TabsTrigger value="registros" className="data-[state=active]:border-indigo-600 data-[state=active]:text-indigo-700 data-[state=active]:shadow-none border-b-2 border-transparent rounded-none px-4 pb-3 pt-1">Registros</TabsTrigger>
              </TabsList>
              {ehEquipe && turmas.length > 0 && (
                <div className="pb-2">
                  <Select value={turmaId} onValueChange={setTurmaId}>
                    <SelectTrigger className="w-56 bg-white h-9"><SelectValue placeholder="Turma" /></SelectTrigger>
                    <SelectContent>
                      {turmas.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {ehEquipe && (
              <TabsContent value="registrar" className="p-6 space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl">
                  <div className="grid gap-2">
                    <Label htmlFor="freq-data">Data da aula</Label>
                    <Input id="freq-data" type="date" value={dataAula} max={new Date().toISOString().slice(0, 10)}
                      onChange={(e) => setDataAula(e.target.value)} />
                  </div>
                  <div className="grid gap-2">
                    <Label>Disciplina (opcional)</Label>
                    <Select value={disciplinaId} onValueChange={setDisciplinaId}>
                      <SelectTrigger className="w-full bg-white"><SelectValue placeholder="Todas" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__todas">Todas</SelectItem>
                        {disciplinas.map((d) => (
                          <SelectItem key={d.disciplina_id} value={String(d.disciplina_id)}>{d.disciplina}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {msgSucesso && <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">{msgSucesso}</div>}
                {erro && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{erro}</div>}

                {alunosTurma.length === 0 ? (
                  <div className="text-sm text-slate-500">Nenhum aluno nesta turma.</div>
                ) : (
                  <div className="space-y-2">
                    {alunosTurma.map((a) => {
                      const r = presencas[a.matricula] || { presente: true, justificativa: '' };
                      return (
                        <div key={a.matricula} className="flex items-center gap-3 p-3 rounded-lg border border-slate-200">
                          <button onClick={() => togglePresenca(a.matricula)} title={r.presente ? 'Marcar falta' : 'Marcar presença'}
                            className={r.presente ? 'text-emerald-600 hover:text-emerald-700' : 'text-red-500 hover:text-red-600'}>
                            {r.presente ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                          </button>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-slate-900">{a.nome}</div>
                            <div className="text-xs text-slate-400">{a.matricula}</div>
                          </div>
                          {!r.presente && (
                            <Input
                              placeholder="Justificativa (opcional)"
                              className="max-w-xs bg-white"
                              value={r.justificativa}
                              onChange={(e) => setPresencas((p) => ({ ...p, [a.matricula]: { ...p[a.matricula], justificativa: e.target.value } }))}
                            />
                          )}
                          <Badge className={r.presente ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-red-100 text-red-700 border-red-200'}>
                            {r.presente ? 'Presente' : 'Falta'}
                          </Badge>
                        </div>
                      );
                    })}
                    <div className="pt-3">
                      <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={salvarLote} disabled={salvando || !turmaId || !dataAula}>
                        {salvando ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />} Salvar frequência
                      </Button>
                    </div>
                  </div>
                )}
              </TabsContent>
            )}

            <TabsContent value="resumo" className="p-6">
              {resumoLoading ? (
                <div className="flex items-center gap-2 text-slate-500 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Carregando resumo…</div>
              ) : resumo.length === 0 ? (
                <div className="text-sm text-slate-500">Nenhum aluno no escopo.</div>
              ) : (
                <div className="rounded-lg border border-slate-200 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50 hover:bg-slate-50">
                        <TableHead>Aluno</TableHead>
                        <TableHead className="text-right">Aulas</TableHead>
                        <TableHead className="text-right">Presenças</TableHead>
                        <TableHead className="text-right">Faltas</TableHead>
                        <TableHead className="text-right">Justificadas</TableHead>
                        <TableHead className="text-right">Presença %</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {resumo.map((r) => (
                        <TableRow key={r.matricula}>
                          <TableCell className="font-medium">{r.nome}</TableCell>
                          <TableCell className="text-right">{r.totalAulas}</TableCell>
                          <TableCell className="text-right">{r.presentes}</TableCell>
                          <TableCell className="text-right">{r.faltas}</TableCell>
                          <TableCell className="text-right">{r.faltasJustificadas}</TableCell>
                          <TableCell className={`text-right font-semibold ${freqColor(r.percentual)}`}>
                            {r.percentual != null ? `${String(r.percentual).replace('.', ',')}%` : '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              {resumo.length === 0 && !resumoLoading && (
                <div className="mt-3 text-xs text-slate-400">A ausência de registros não significa presença total — a porcentagem é calculada apenas com aulas registradas.</div>
              )}
            </TabsContent>

            <TabsContent value="registros" className="p-6">
              {registrosLoading ? (
                <div className="flex items-center gap-2 text-slate-500 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Carregando registros…</div>
              ) : registros.length === 0 ? (
                <div className="text-sm text-slate-500">Nenhum registro de frequência encontrado.</div>
              ) : (
                <div className="rounded-lg border border-slate-200 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50 hover:bg-slate-50">
                        <TableHead>Data</TableHead>
                        {ehEquipe && <TableHead>Aluno</TableHead>}
                        <TableHead>Disciplina</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Justificativa</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {registros.slice(0, 300).map((f, i) => (
                        <TableRow key={f.id || i}>
                          <TableCell>{f.data_aula ? new Date(`${f.data_aula}T12:00:00`).toLocaleDateString('pt-BR') : '—'}</TableCell>
                          {ehEquipe && <TableCell className="font-medium">{f.matricula_aluno}</TableCell>}
                          <TableCell>{f.disciplina_id ? `Disciplina ${f.disciplina_id}` : 'Geral'}</TableCell>
                          <TableCell>
                            <Badge className={f.presente ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-red-100 text-red-700 border-red-200'}>
                              {f.presente ? 'Presente' : 'Falta'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-slate-500">{f.justificativa || '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
}
