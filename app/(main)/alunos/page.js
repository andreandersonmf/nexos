'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Header } from '@/components/nexos/header';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, Plus, MoreHorizontal, Loader2 } from 'lucide-react';
import { useAuth } from '@/components/nexos/auth-provider';
import { api } from '@/lib/client/api';

const STATUS_LABEL = { ATIVO: 'Ativo', INATIVO: 'Inativo', TRANSFERIDO: 'Transferido' };

export default function AlunosPage() {
  const { user } = useAuth();
  const podeCriar = user?.perfil === 'ADMIN' || user?.perfil === 'COORDENADOR';
  const ehAluno = user?.perfil === 'ALUNO';
  const subtitle = ehAluno
    ? 'Acompanhe seus dados acadêmicos.'
    : user?.perfil === 'PROFESSOR'
      ? 'Alunos das suas turmas.'
      : 'Gerencie o cadastro, situação acadêmica e histórico dos alunos.';

  const [q, setQ] = useState('');
  const [turmaFiltro, setTurmaFiltro] = useState('todas');
  const [data, setData] = useState({ items: [], turmas: [] });
  const [loading, setLoading] = useState(true);

  const [dialogAberto, setDialogAberto] = useState(false);
  const [form, setForm] = useState({ nome: '', matricula: '', turma_id: '', data_nascimento: '', email: '' });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const carregar = async (params) => {
    setLoading(true);
    try {
      const busca = new URLSearchParams();
      if (params.q) busca.set('q', params.q);
      if (params.turma_id) busca.set('turma_id', params.turma_id);
      const d = await api(`/alunos${busca.toString() ? `?${busca}` : ''}`);
      setData({ items: d.items || [], turmas: d.turmas || [] });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => {
      carregar({ q, turma_id: turmaFiltro === 'todas' ? '' : turmaFiltro });
    }, 200);
    return () => clearTimeout(t);
  }, [q, turmaFiltro]);

  const abrirNovo = () => {
    setForm({ nome: '', matricula: '', turma_id: data.turmas[0]?.id?.toString() || '', data_nascimento: '', email: '' });
    setErro('');
    setDialogAberto(true);
  };

  const salvarNovo = async () => {
    setSalvando(true);
    setErro('');
    try {
      await api('/alunos', {
        method: 'POST',
        body: {
          nome: form.nome,
          matricula: form.matricula,
          turma_id: Number(form.turma_id),
          data_nascimento: form.data_nascimento || null,
          email: form.email || null,
        },
      });
      setDialogAberto(false);
      carregar({ q, turma_id: turmaFiltro === 'todas' ? '' : turmaFiltro });
    } catch (e) {
      setErro(e.message || 'Não foi possível cadastrar o aluno.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div>
      <Header title="Alunos" subtitle={subtitle} showSearch={false} />
      <div className="px-8 pb-8">
        <Card className="p-5 border-slate-200 shadow-none">
          <div className="flex items-center justify-between mb-4 gap-3">
            <div className="flex items-center gap-3 flex-1">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input value={q} onChange={(e) => setQ(e.target.value)}
                  placeholder="Buscar aluno…" className="pl-9" />
              </div>
              {!ehAluno && data.turmas.length > 0 && (
                <Select value={turmaFiltro} onValueChange={setTurmaFiltro}>
                  <SelectTrigger className="w-52 bg-white">
                    <SelectValue placeholder="Todas as turmas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">Todas as turmas</SelectItem>
                    {data.turmas.map((t) => (
                      <SelectItem key={t.id} value={String(t.id)}>{t.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            {podeCriar && (
              <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={abrirNovo}>
                <Plus className="w-4 h-4 mr-1" /> Novo aluno
              </Button>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 hover:bg-slate-50">
                  <TableHead className="text-slate-600 font-medium">Nome</TableHead>
                  <TableHead className="text-slate-600 font-medium">Turma</TableHead>
                  <TableHead className="text-slate-600 font-medium">Situação</TableHead>
                  <TableHead className="text-slate-600 font-medium text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow><TableCell colSpan={4} className="py-10 text-center text-slate-500">
                    <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Carregando…
                  </TableCell></TableRow>
                )}
                {!loading && data.items.length === 0 && (
                  <TableRow><TableCell colSpan={4} className="py-10 text-center text-slate-500">Nenhum aluno encontrado.</TableCell></TableRow>
                )}
                {!loading && data.items.map((a) => {
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
                      <TableCell className="text-sm text-slate-600">{a.turma}</TableCell>
                      <TableCell>
                        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-emerald-200">
                          {STATUS_LABEL[a.status] || a.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Link href={`/alunos/${a.matricula}`}
                          className="inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-slate-100 text-slate-400">
                          <MoreHorizontal className="w-4 h-4" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
            <div>Mostrando {data.items.length} aluno(s)</div>
            {podeCriar && <div>Novos alunos são vinculados a uma turma existente.</div>}
          </div>
        </Card>
      </div>

      <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Novo aluno</DialogTitle>
            <DialogDescription>
              Cadastre o aluno e vincule-o a uma turma. A conta de acesso é criada pela administração, na área de usuários.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="novo-nome">Nome completo</Label>
              <Input id="novo-nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Nome do aluno" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="novo-matricula">Matrícula</Label>
                <Input id="novo-matricula" value={form.matricula} onChange={(e) => setForm({ ...form, matricula: e.target.value })} placeholder="Ex.: 2026-0001" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="novo-nascimento">Data de nascimento</Label>
                <Input id="novo-nascimento" type="date" value={form.data_nascimento} onChange={(e) => setForm({ ...form, data_nascimento: e.target.value })} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Turma</Label>
              <Select value={form.turma_id} onValueChange={(v) => setForm({ ...form, turma_id: v })}>
                <SelectTrigger className="w-full bg-white">
                  <SelectValue placeholder="Selecione a turma" />
                </SelectTrigger>
                <SelectContent>
                  {data.turmas.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>{t.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="novo-email">E-mail (opcional)</Label>
              <Input id="novo-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="email@exemplo.com" />
            </div>
            {erro && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{erro}</div>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogAberto(false)} disabled={salvando}>Cancelar</Button>
            <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={salvarNovo} disabled={salvando || !form.nome.trim() || !form.matricula.trim() || !form.turma_id}>
              {salvando && <Loader2 className="w-4 h-4 animate-spin mr-1" />} Cadastrar aluno
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
