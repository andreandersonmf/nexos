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
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import {
  ArrowLeft, Users, CalendarCheck, TrendingUp, Bell, Loader2, Plus, X, GraduationCap,
} from 'lucide-react';
import { useAuth } from '@/components/nexos/auth-provider';
import { api } from '@/lib/client/api';

function notaColor(v) {
  if (v == null) return 'text-slate-300';
  if (v < 6) return 'text-red-600';
  if (v < 7.5) return 'text-amber-600';
  return 'text-emerald-600';
}
function freqColor(v) {
  if (v == null) return 'text-slate-300';
  if (v < 75) return 'text-red-600';
  if (v < 85) return 'text-amber-600';
  return 'text-emerald-600';
}
function pct(v) { return v != null ? `${v}%` : '—'; }

export default function TurmaDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const podeGerenciar = user?.perfil === 'ADMIN' || user?.perfil === 'COORDENADOR';

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');

  const [profDialog, setProfDialog] = useState(false);
  const [professoresDisponiveis, setProfessoresDisponiveis] = useState([]);
  const [profSelecionado, setProfSelecionado] = useState('');
  const [trabalhando, setTrabalhando] = useState(false);

  const carregar = async () => {
    try {
      setData(await api(`/turmas/${id}`));
    } catch (e) {
      setErro(e.message || 'Não foi possível carregar a turma.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { carregar(); }, [id]);

  const abrirProfDialog = async () => {
    setProfDialog(true);
    setProfSelecionado('');
    try {
      const d = await api('/professores');
      setProfessoresDisponiveis(d.items || []);
    } catch {
      setProfessoresDisponiveis([]);
    }
  };

  const vincularProfessor = async (professorId, acao) => {
    setTrabalhando(true);
    setErro('');
    try {
      await api(`/turmas/${id}/professores`, {
        method: 'POST',
        body: { usuario_id: Number(professorId), acao },
      });
      await carregar();
      if (acao === 'adicionar') setProfSelecionado('');
    } catch (e) {
      setErro(e.message || 'Não foi possível atualizar o vínculo.');
    } finally {
      setTrabalhando(false);
    }
  };

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

  const { turma, alunos, metricas, professores } = data;
  const vinculados = new Set((professores || []).map((p) => p.id));
  const disponiveis = professoresDisponiveis.filter((p) => !vinculados.has(p.id));

  return (
    <div>
      <Header title={`Turma ${turma.nome}`}
        subtitle={`${turma.turno} · Ano letivo ${turma.ano_letivo}`} showSearch={false} />

      <div className="px-8 pb-8 space-y-6">
        <Button variant="ghost" onClick={() => router.push('/turmas')} className="text-slate-600">
          <ArrowLeft className="w-4 h-4 mr-2" /> Voltar para turmas
        </Button>

        {erro && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{erro}</div>}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard icon={Users}         label="Alunos"           value={metricas.totalAlunos}                                                     iconColor="indigo" />
          <MetricCard icon={TrendingUp}    label="Média geral"      value={metricas.mediaGeral != null ? metricas.mediaGeral.toFixed(1).replace('.', ',') : '—'} iconColor="emerald" />
          <MetricCard icon={CalendarCheck} label="Frequência média" value={pct(metricas.freqMedia)}                                                 iconColor="sky" />
          <MetricCard icon={Bell}          label="Alertas em aberto" value={metricas.totalAlertas}                                                   iconColor="red" />
        </div>

        <Card className="border-slate-200 shadow-none">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <GraduationCap className="w-4 h-4 text-indigo-500" /> Professores
            </h3>
            {podeGerenciar && (
              <Button variant="outline" size="sm" onClick={abrirProfDialog} className="border-indigo-200 text-indigo-700 hover:bg-indigo-50">
                <Plus className="w-4 h-4 mr-1" /> Gerenciar vínculos
              </Button>
            )}
          </div>
          <div className="p-5">
            {(professores || []).length === 0 ? (
              <div className="text-sm text-slate-500">Nenhum professor vinculado a esta turma.</div>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                {professores.map((p) => (
                  <span key={p.id} className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full bg-violet-50 text-violet-700 border border-violet-100">
                    {p.nome}
                    {podeGerenciar && (
                      <button onClick={() => vincularProfessor(p.id, 'remover')} disabled={trabalhando}
                        className="text-violet-400 hover:text-red-600" title="Remover vínculo">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </span>
                ))}
              </div>
            )}
          </div>
        </Card>

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
              {alunos.length === 0 && (
                <TableRow><TableCell colSpan={4} className="py-10 text-center text-slate-500">Nenhum aluno matriculado nesta turma.</TableCell></TableRow>
              )}
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
                    <TableCell className={`text-right font-medium ${freqColor(a.freqPct)}`}>{pct(a.freqPct)}</TableCell>
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

      <Dialog open={profDialog} onOpenChange={setProfDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Vincular professor</DialogTitle>
            <DialogDescription>Atribua professores à turma {turma.nome}.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Professor</Label>
              <Select value={profSelecionado} onValueChange={setProfSelecionado}>
                <SelectTrigger className="w-full bg-white"><SelectValue placeholder="Selecione um professor" /></SelectTrigger>
                <SelectContent>
                  {disponiveis.length === 0 && <SelectItem value="__vazio" disabled>Nenhum professor disponível</SelectItem>}
                  {disponiveis.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {erro && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{erro}</div>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProfDialog(false)} disabled={trabalhando}>Fechar</Button>
            <Button className="bg-indigo-600 hover:bg-indigo-700" disabled={trabalhando || !profSelecionado}
              onClick={() => vincularProfessor(profSelecionado, 'adicionar')}>
              {trabalhando && <Loader2 className="w-4 h-4 animate-spin mr-1" />} Vincular
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
