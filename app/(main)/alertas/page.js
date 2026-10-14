'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Header } from '@/components/nexos/header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Bell, RefreshCw, CheckCircle2, Loader2, Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/components/nexos/auth-provider';
import { api } from '@/lib/client/api';

const prioBadge = {
  alta:  'bg-red-100 text-red-700 border-red-200',
  media: 'bg-amber-100 text-amber-700 border-amber-200',
  baixa: 'bg-slate-100 text-slate-600 border-slate-200',
};
const tipoLabel = { frequencia: 'Frequência', desempenho: 'Desempenho', manual: 'Manual' };

export default function AlertasPage() {
  const { user } = useAuth();
  const podeRegenerar = user?.perfil === 'ADMIN' || user?.perfil === 'COORDENADOR';

  const [items, setItems] = useState([]);
  const [resumo, setResumo] = useState(null);
  const [turmas, setTurmas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [filtro, setFiltro] = useState('aberto');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [filtroPrio, setFiltroPrio] = useState('');
  const [filtroTurma, setFiltroTurma] = useState('');
  const [q, setQ] = useState('');

  const [dialogAberto, setDialogAberto] = useState(false);
  const [alunos, setAlunos] = useState([]);
  const [form, setForm] = useState({ matricula_aluno: '', prioridade: 'media', categoria: 'outros', descricao: '' });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const carregar = async () => {
    setLoading(true);
    try {
      const busca = new URLSearchParams();
      if (filtro !== 'todos') busca.set('status', filtro);
      if (filtroTipo) busca.set('tipo', filtroTipo);
      if (filtroPrio) busca.set('prioridade', filtroPrio);
      if (filtroTurma) busca.set('turma_id', filtroTurma);
      if (q) busca.set('q', q);
      const d = await api(`/alertas${busca.toString() ? `?${busca}` : ''}`);
      setItems(d.items || []);
      setResumo(d.resumo || null);
    } catch (e) {
      toast.error(e.message || 'Falha ao carregar alertas.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { carregar(); }, [filtro, filtroTipo, filtroPrio, filtroTurma, q]);

  useEffect(() => {
    (async () => {
      try {
        const d = await api('/turmas');
        let lista = d.items || [];
        if (user?.perfil === 'PROFESSOR') lista = lista.filter((t) => (user.turmas || []).includes(Number(t.id)));
        setTurmas(lista);
      } catch { setTurmas([]); }
    })();
  }, [user]);

  const regenerar = async () => {
    setRegenerating(true);
    try {
      const d = await api('/alertas/regenerar', { method: 'POST' });
      toast.success(`${d.gerados || 0} alerta(s) gerado(s) pelo motor automático.`);
      carregar();
    } catch (e) {
      toast.error(e.message || 'Falha ao regenerar.');
    } finally { setRegenerating(false); }
  };

  const marcarResolvido = async (id) => {
    try {
      await api(`/alertas/${id}`, { method: 'PATCH', body: { status: 'resolvido' } });
      setItems((prev) => prev.map((a) => a.id === id ? { ...a, status: 'resolvido' } : a));
      toast.success('Alerta marcado como resolvido.');
    } catch (e) { toast.error(e.message || 'Falha ao atualizar.'); }
  };

  const abrirNovo = async () => {
    setForm({ matricula_aluno: '', prioridade: 'media', categoria: 'outros', descricao: '' });
    setErro('');
    setDialogAberto(true);
    try {
      const d = await api('/alunos');
      setAlunos(d.items || []);
    } catch { setAlunos([]); }
  };

  const salvar = async () => {
    setSalvando(true);
    setErro('');
    try {
      await api('/alertas', { method: 'POST', body: form });
      setDialogAberto(false);
      toast.success('Alerta manual criado.');
      carregar();
    } catch (e) {
      setErro(e.message || 'Não foi possível criar o alerta.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div>
      <Header title="Alertas" subtitle="Monitore riscos de evasão e queda de desempenho." showSearch={false} />
      <div className="px-8 pb-8 space-y-4">
        <Card className="p-5 border-slate-200 shadow-none">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center">
                <Bell className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-900">Alertas acadêmicos</div>
                <div className="text-xs text-slate-500 mt-0.5">
                  Regras automáticas: Frequência &lt; 75% (alta) ou &lt; 85% (média) · Média &lt; 5,0 (alta), &lt; 6,0 (média) ou &lt; 7,0 (baixa).
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={abrirNovo} className="border-indigo-200 text-indigo-700 hover:bg-indigo-50">
                <Plus className="w-4 h-4 mr-1" /> Alerta manual
              </Button>
              {podeRegenerar && (
                <Button onClick={regenerar} disabled={regenerating} className="bg-indigo-600 hover:bg-indigo-700">
                  {regenerating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analisando…</>
                    : <><RefreshCw className="w-4 h-4 mr-2" /> Analisar escola</>}
                </Button>
              )}
            </div>
          </div>
          {resumo && (
            <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-slate-500">
              <div><span className="font-semibold text-slate-900">{resumo.abertos}</span> em aberto (no escopo)</div>
              <div><span className="font-semibold text-red-600">{resumo.porPrioridade.alta}</span> prioridade alta</div>
              <div><span className="font-semibold text-amber-600">{resumo.porPrioridade.media}</span> prioridade média</div>
              <div><span className="font-semibold text-slate-600">{resumo.porTipo.frequencia + resumo.porTipo.desempenho + resumo.porTipo.manual}</span> no filtro atual</div>
            </div>
          )}
        </Card>

        <Card className="border-slate-200 shadow-none">
          <div className="p-4 border-b border-slate-100 flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar aluno ou descrição…" className="pl-9" />
            </div>
            <Select value={filtro} onValueChange={setFiltro}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="aberto">Em aberto</SelectItem>
                <SelectItem value="resolvido">Resolvidos</SelectItem>
                <SelectItem value="todos">Todos</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filtroTipo} onValueChange={(v) => setFiltroTipo(v === '__todos' ? '' : v)}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Todos os tipos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__todos">Todos os tipos</SelectItem>
                <SelectItem value="frequencia">Frequência</SelectItem>
                <SelectItem value="desempenho">Desempenho</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filtroPrio} onValueChange={(v) => setFiltroPrio(v === '__todas' ? '' : v)}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Todas prioridades" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__todas">Todas prioridades</SelectItem>
                <SelectItem value="alta">Alta</SelectItem>
                <SelectItem value="media">Média</SelectItem>
                <SelectItem value="baixa">Baixa</SelectItem>
              </SelectContent>
            </Select>
            {turmas.length > 0 && (
              <Select value={filtroTurma} onValueChange={(v) => setFiltroTurma(v === '__todas' ? '' : v)}>
                <SelectTrigger className="w-44"><SelectValue placeholder="Todas as turmas" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__todas">Todas as turmas</SelectItem>
                  {turmas.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50 hover:bg-slate-50">
                <TableHead>Aluno</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Prioridade</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow><TableCell colSpan={6} className="py-10 text-center text-slate-500">
                  <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Carregando…
                </TableCell></TableRow>
              )}
              {!loading && items.length === 0 && (
                <TableRow><TableCell colSpan={6} className="py-10 text-center text-slate-500">Nenhum alerta.</TableCell></TableRow>
              )}
              {!loading && items.map((a) => {
                const iniciais = (a.aluno_nome || '').split(' ').map((n) => n[0]).slice(0, 2).join('');
                return (
                  <TableRow key={a.id} className="hover:bg-slate-50">
                    <TableCell className="py-3">
                      <Link href={`/alunos/${a.matricula_aluno}`} className="flex items-center gap-3 group">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="bg-indigo-100 text-indigo-700 text-xs">{iniciais}</AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="text-sm font-medium text-slate-900 group-hover:text-indigo-700">{a.aluno_nome}</div>
                          <div className="text-xs text-slate-400">{a.turma}</div>
                        </div>
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-slate-700">
                      {tipoLabel[a.tipo] || a.tipo}
                      {a.categoria && a.tipo === 'manual' && <div className="text-xs text-slate-400">{a.categoria}</div>}
                    </TableCell>
                    <TableCell className="text-sm text-slate-600 max-w-md">{a.descricao}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`capitalize ${prioBadge[a.prioridade] || ''}`}>{a.prioridade}</Badge>
                    </TableCell>
                    <TableCell>
                      {a.status === 'aberto'
                        ? <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100">Aberto</Badge>
                        : <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Resolvido</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      {a.status === 'aberto' && (
                        <Button size="sm" variant="ghost" onClick={() => marcarResolvido(a.id)}
                          className="text-emerald-600 hover:text-emerald-700">
                          <CheckCircle2 className="w-4 h-4 mr-1" /> Resolver
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      </div>

      <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Alerta manual</DialogTitle>
            <DialogDescription>Registre um alerta manual sobre um aluno. Alertas automáticos não são duplicados.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Aluno</Label>
              <Select value={form.matricula_aluno} onValueChange={(v) => setForm({ ...form, matricula_aluno: v })}>
                <SelectTrigger className="w-full bg-white"><SelectValue placeholder="Selecione o aluno" /></SelectTrigger>
                <SelectContent>
                  {alunos.map((a) => (
                    <SelectItem key={a.matricula} value={a.matricula}>{a.nome} ({a.turma})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Prioridade</Label>
                <Select value={form.prioridade} onValueChange={(v) => setForm({ ...form, prioridade: v })}>
                  <SelectTrigger className="w-full bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="alta">Alta</SelectItem>
                    <SelectItem value="media">Média</SelectItem>
                    <SelectItem value="baixa">Baixa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Categoria</Label>
                <Select value={form.categoria} onValueChange={(v) => setForm({ ...form, categoria: v })}>
                  <SelectTrigger className="w-full bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="comportamento">Comportamento</SelectItem>
                    <SelectItem value="social">Social</SelectItem>
                    <SelectItem value="saude">Saúde</SelectItem>
                    <SelectItem value="outros">Outros</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="alerta-desc">Descrição</Label>
              <Textarea id="alerta-desc" rows={3} value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
            </div>
            {erro && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{erro}</div>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogAberto(false)} disabled={salvando}>Cancelar</Button>
            <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={salvar}
              disabled={salvando || !form.matricula_aluno || !form.descricao.trim()}>
              {salvando && <Loader2 className="w-4 h-4 animate-spin mr-1" />} Criar alerta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
