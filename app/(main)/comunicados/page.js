'use client';

import { useEffect, useState } from 'react';
import { Header } from '@/components/nexos/header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import {
  MessageSquare, Plus, Loader2, Trash2, Pencil, ChevronDown, ChevronUp, Megaphone,
} from 'lucide-react';
import { useAuth } from '@/components/nexos/auth-provider';
import { api } from '@/lib/client/api';

export default function ComunicadosPage() {
  const { user } = useAuth();
  const ehEquipe = ['ADMIN', 'COORDENADOR', 'PROFESSOR'].includes(user?.perfil);
  const ehAluno = user?.perfil === 'ALUNO';

  const [statusFiltro, setStatusFiltro] = useState('publicado');
  const [items, setItems] = useState([]);
  const [podePublicar, setPodePublicar] = useState(false);
  const [loading, setLoading] = useState(true);
  const [aberto, setAberto] = useState(null); // id expandido

  const [dialogAberto, setDialogAberto] = useState(false);
  const [editando, setEditando] = useState(null); // comunicado em edição
  const [form, setForm] = useState({ titulo: '', conteudo: '', escopo: 'institucional', status: 'publicado' });
  const [turmas, setTurmas] = useState([]);
  const [turmasSelecionadas, setTurmasSelecionadas] = useState([]);
  const [alunos, setAlunos] = useState([]);
  const [alunoTurmaId, setAlunoTurmaId] = useState('');
  const [matriculasSelecionadas, setMatriculasSelecionadas] = useState([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const carregar = async () => {
    setLoading(true);
    try {
      const d = await api(`/comunicados?status=${ehEquipe ? statusFiltro : 'publicado'}`);
      setItems(d.items || []);
      setPodePublicar(!!d.pode_publicar);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { carregar(); }, [statusFiltro]);

  const abrirNovo = async () => {
    setEditando(null);
    setForm({ titulo: '', conteudo: '', escopo: 'institucional', status: 'publicado' });
    setTurmasSelecionadas([]);
    setMatriculasSelecionadas([]);
    setAlunoTurmaId('');
    setErro('');
    setDialogAberto(true);
    try {
      const d = await api('/turmas');
      let lista = d.items || [];
      if (user?.perfil === 'PROFESSOR') lista = lista.filter((t) => (user.turmas || []).includes(Number(t.id)));
      setTurmas(lista);
    } catch { setTurmas([]); }
  };

  const abrirEdicao = async (c) => {
    setEditando(c);
    setForm({
      titulo: c.titulo,
      conteudo: c.conteudo,
      escopo: c.destinatarios?.escopo || 'institucional',
      status: c.status,
    });
    setTurmasSelecionadas(c.destinatarios?.turma_ids || []);
    setMatriculasSelecionadas(c.destinatarios?.matriculas || []);
    setAlunoTurmaId('');
    setErro('');
    setDialogAberto(true);
    try {
      const d = await api('/turmas');
      let lista = d.items || [];
      if (user?.perfil === 'PROFESSOR') lista = lista.filter((t) => (user.turmas || []).includes(Number(t.id)));
      setTurmas(lista);
    } catch { setTurmas([]); }
  };

  const carregarAlunos = async (tid) => {
    setAlunoTurmaId(tid);
    if (!tid) { setAlunos([]); return; }
    try {
      const d = await api(`/alunos?turma_id=${tid}`);
      setAlunos(d.items || []);
    } catch { setAlunos([]); }
  };

  const salvar = async () => {
    setSalvando(true);
    setErro('');
    try {
      const body = {
        titulo: form.titulo,
        conteudo: form.conteudo,
        escopo: form.escopo,
        status: form.status,
        turma_ids: form.escopo === 'turmas' ? turmasSelecionadas : undefined,
        matriculas: form.escopo === 'alunos' ? matriculasSelecionadas : undefined,
      };
      if (editando) {
        await api(`/comunicados/${editando.id}`, { method: 'PATCH', body });
      } else {
        await api('/comunicados', { method: 'POST', body });
      }
      setDialogAberto(false);
      carregar();
    } catch (e) {
      setErro(e.message || 'Não foi possível salvar o comunicado.');
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async (c) => {
    if (!confirm(`Excluir o comunicado "${c.titulo}"?`)) return;
    try {
      await api(`/comunicados/${c.id}`, { method: 'DELETE' });
      carregar();
    } catch (e) {
      alert(e.message || 'Não foi possível excluir.');
    }
  };

  const abrirDetalhe = async (c) => {
    setAberto(aberto === c.id ? null : c.id);
    if (ehAluno && !c.lido) {
      try {
        await api(`/comunicados/${c.id}/leitura`, { method: 'POST' });
        carregar();
      } catch { /* ignora */ }
    }
  };

  return (
    <div>
      <Header title="Comunicados" subtitle={ehAluno ? 'Avisos e comunicados destinados a você.' : 'Comunique-se com turmas e alunos.'} showSearch={false} />
      <div className="px-8 pb-8">
        <Card className="p-5 border-slate-200 shadow-none">
          <div className="flex items-center justify-between mb-4 gap-3">
            {ehEquipe ? (
              <div className="flex items-center gap-3">
                <Select value={statusFiltro} onValueChange={setStatusFiltro}>
                  <SelectTrigger className="w-44 bg-white"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="publicado">Publicados</SelectItem>
                    <SelectItem value="rascunho">Rascunhos</SelectItem>
                    <SelectItem value="todos">Todos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="text-sm text-slate-500">Comunicados publicados para você.</div>
            )}
            {ehEquipe && podePublicar && (
              <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={abrirNovo}>
                <Plus className="w-4 h-4 mr-1" /> Novo comunicado
              </Button>
            )}
          </div>

          {loading ? (
            <div className="py-10 flex items-center justify-center gap-2 text-slate-500 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando comunicados…
            </div>
          ) : items.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500 flex items-center justify-center gap-2">
              <Megaphone className="w-4 h-4" /> Nenhum comunicado encontrado.
            </div>
          ) : (
            <ul className="space-y-2">
              {items.map((c) => (
                <li key={c.id} className="rounded-lg border border-slate-200">
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <button className="flex-1 text-left" onClick={() => abrirDetalhe(c)}>
                        <div className="flex items-center gap-2">
                          <div className={`text-sm font-semibold ${ehAluno && !c.lido ? 'text-slate-900' : 'text-slate-700'}`}>{c.titulo}</div>
                          {ehAluno && !c.lido && <Badge className="bg-indigo-100 text-indigo-700 border-indigo-200">Novo</Badge>}
                          {c.status === 'rascunho' && <Badge className="bg-slate-100 text-slate-600 border-slate-200">Rascunho</Badge>}
                        </div>
                        <div className="text-xs text-slate-500 mt-1">
                          {c.data_publicacao ? new Date(c.data_publicacao).toLocaleDateString('pt-BR') : new Date(c.criado_em).toLocaleDateString('pt-BR')}
                          {' · '}{c.destinatarios_resumo} · por {c.publicado_nome}
                          {ehEquipe && c.status === 'publicado' && ` · ${c.total_leituras} leitura(s)`}
                        </div>
                      </button>
                      <div className="flex items-center gap-1 shrink-0">
                        {ehEquipe && (user?.perfil !== 'PROFESSOR' || c.publicado_por === user?.id) && (
                          <>
                            <Button variant="ghost" size="sm" onClick={() => abrirEdicao(c)} title="Editar">
                              <Pencil className="w-4 h-4 text-slate-400" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => excluir(c)} title="Excluir">
                              <Trash2 className="w-4 h-4 text-red-400" />
                            </Button>
                          </>
                        )}
                        {aberto === c.id ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                      </div>
                    </div>
                  </div>
                  {aberto === c.id && (
                    <div className="px-4 pb-4 border-t border-slate-100 pt-3">
                      <div className="text-sm text-slate-700 whitespace-pre-wrap">{c.conteudo}</div>
                      {ehAluno && c.data_leitura && (
                        <div className="text-xs text-slate-400 mt-3">Você leu este comunicado em {new Date(c.data_leitura).toLocaleString('pt-BR')}.</div>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editando ? 'Editar comunicado' : 'Novo comunicado'}</DialogTitle>
            <DialogDescription>Informe o conteúdo e os destinatários.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="com-titulo">Título</Label>
              <Input id="com-titulo" value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="com-conteudo">Conteúdo</Label>
              <Textarea id="com-conteudo" rows={4} value={form.conteudo} onChange={(e) => setForm({ ...form, conteudo: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Destinatários</Label>
                <Select value={form.escopo} onValueChange={(v) => setForm({ ...form, escopo: v })}>
                  <SelectTrigger className="w-full bg-white"><SelectValue placeholder="Escopo" /></SelectTrigger>
                  <SelectContent>
                    {(user?.perfil === 'ADMIN' || user?.perfil === 'COORDENADOR') && <SelectItem value="institucional">Toda a instituição</SelectItem>}
                    <SelectItem value="turmas">Turmas específicas</SelectItem>
                    <SelectItem value="alunos">Alunos específicos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger className="w-full bg-white"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="publicado">Publicar agora</SelectItem>
                    <SelectItem value="rascunho">Salvar como rascunho</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {form.escopo === 'turmas' && (
              <div className="grid gap-2">
                <Label>Turmas</Label>
                <div className="flex flex-wrap gap-2">
                  {turmas.map((t) => {
                    const marcada = turmasSelecionadas.includes(Number(t.id));
                    return (
                      <button key={t.id} type="button"
                        onClick={() => setTurmasSelecionadas((s) => marcada ? s.filter((x) => x !== Number(t.id)) : [...s, Number(t.id)])}
                        className={`text-xs px-3 py-1.5 rounded-full border ${marcada ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'}`}>
                        {t.nome}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {form.escopo === 'alunos' && (
              <div className="grid gap-2">
                <Label>Alunos</Label>
                <Select value={alunoTurmaId} onValueChange={carregarAlunos}>
                  <SelectTrigger className="w-full bg-white"><SelectValue placeholder="Filtrar por turma" /></SelectTrigger>
                  <SelectContent>
                    {turmas.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
                <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                  {alunos.map((a) => {
                    const marcado = matriculasSelecionadas.includes(a.matricula);
                    return (
                      <button key={a.matricula} type="button"
                        onClick={() => setMatriculasSelecionadas((s) => marcado ? s.filter((x) => x !== a.matricula) : [...s, a.matricula])}
                        className={`text-xs px-3 py-1.5 rounded-full border ${marcado ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'}`}>
                        {a.nome}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {erro && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{erro}</div>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogAberto(false)} disabled={salvando}>Cancelar</Button>
            <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={salvar}
              disabled={salvando || !form.titulo.trim() || !form.conteudo.trim() ||
                (form.escopo === 'turmas' && turmasSelecionadas.length === 0) ||
                (form.escopo === 'alunos' && matriculasSelecionadas.length === 0)}>
              {salvando && <Loader2 className="w-4 h-4 animate-spin mr-1" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
