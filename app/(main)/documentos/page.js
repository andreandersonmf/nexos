'use client';

import { useEffect, useRef, useState } from 'react';
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
import { FileText, Upload, Loader2, Download, Trash2, Search, FolderOpen } from 'lucide-react';
import { useAuth } from '@/components/nexos/auth-provider';
import { api } from '@/lib/client/api';

function tamanhoFmt(bytes) {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentosPage() {
  const { user } = useAuth();
  const ehEquipe = ['ADMIN', 'COORDENADOR', 'PROFESSOR'].includes(user?.perfil);
  const [q, setQ] = useState('');
  const [categoria, setCategoria] = useState('todas');
  const [data, setData] = useState({ items: [], categorias: [], pode_publicar: false });
  const [loading, setLoading] = useState(true);

  const [dialogAberto, setDialogAberto] = useState(false);
  const [form, setForm] = useState({ nome: '', descricao: '', categoria: '', escopo: 'institucional' });
  const [arquivo, setArquivo] = useState(null);
  const [turmas, setTurmas] = useState([]);
  const [turmasSelecionadas, setTurmasSelecionadas] = useState([]);
  const [alunos, setAlunos] = useState([]);
  const [alunoTurmaId, setAlunoTurmaId] = useState('');
  const [matriculasSelecionadas, setMatriculasSelecionadas] = useState([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const fileRef = useRef(null);

  const carregar = async () => {
    setLoading(true);
    try {
      const busca = new URLSearchParams();
      if (q) busca.set('q', q);
      if (categoria !== 'todas') busca.set('categoria', categoria);
      const d = await api(`/documentos${busca.toString() ? `?${busca}` : ''}`);
      setData(d);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(carregar, 250);
    return () => clearTimeout(t);
  }, [q, categoria]);

  const abrirDialog = async () => {
    setDialogAberto(true);
    setForm({ nome: '', descricao: '', categoria: '', escopo: 'institucional' });
    setArquivo(null);
    setTurmasSelecionadas([]);
    setMatriculasSelecionadas([]);
    setAlunoTurmaId('');
    setErro('');
    if (fileRef.current) fileRef.current.value = '';
    try {
      const d = await api('/turmas');
      let lista = d.items || [];
      if (user?.perfil === 'PROFESSOR') lista = lista.filter((t) => (user.turmas || []).includes(Number(t.id)));
      setTurmas(lista);
    } catch { setTurmas([]); }
  };

  const carregarAlunos = async (tid) => {
    setAlunoTurmaId(tid);
    setMatriculasSelecionadas([]);
    if (!tid) { setAlunos([]); return; }
    try {
      const d = await api(`/alunos?turma_id=${tid}`);
      setAlunos(d.items || []);
    } catch { setAlunos([]); }
  };

  const publicar = async () => {
    if (!arquivo) { setErro('Selecione um arquivo.'); return; }
    setSalvando(true);
    setErro('');
    try {
      const fd = new FormData();
      fd.append('arquivo', arquivo);
      fd.append('nome', form.nome);
      fd.append('descricao', form.descricao);
      fd.append('categoria', form.categoria || 'Geral');
      fd.append('escopo', form.escopo);
      if (form.escopo === 'turmas') fd.append('turma_ids', turmasSelecionadas.join(','));
      if (form.escopo === 'alunos') fd.append('matriculas', matriculasSelecionadas.join(','));
      await api('/documentos', { method: 'POST', body: fd });
      setDialogAberto(false);
      carregar();
    } catch (e) {
      setErro(e.message || 'Não foi possível publicar o documento.');
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async (d) => {
    if (!confirm(`Excluir o documento "${d.nome}"?`)) return;
    try {
      await api(`/documentos/${d.id}`, { method: 'DELETE' });
      carregar();
    } catch (e) {
      alert(e.message || 'Não foi possível excluir.');
    }
  };

  return (
    <div>
      <Header title="Documentos" subtitle="Documentos institucionais e materiais compartilhados." showSearch={false} />
      <div className="px-8 pb-8">
        <Card className="p-5 border-slate-200 shadow-none">
          <div className="flex items-center justify-between mb-4 gap-3">
            <div className="flex items-center gap-3 flex-1">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar documento…" className="pl-9" />
              </div>
              {data.categorias.length > 0 && (
                <Select value={categoria} onValueChange={setCategoria}>
                  <SelectTrigger className="w-48 bg-white"><SelectValue placeholder="Categoria" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">Todas as categorias</SelectItem>
                    {data.categorias.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>
            {ehEquipe && data.pode_publicar && (
              <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={abrirDialog}>
                <Upload className="w-4 h-4 mr-1" /> Publicar documento
              </Button>
            )}
          </div>

          {loading ? (
            <div className="py-10 flex items-center justify-center gap-2 text-slate-500 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando documentos…
            </div>
          ) : data.items.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500 flex items-center justify-center gap-2">
              <FolderOpen className="w-4 h-4" /> Nenhum documento encontrado.
            </div>
          ) : (
            <ul className="space-y-2">
              {data.items.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50/60">
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText className="w-5 h-5 text-indigo-500 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900 truncate">{d.nome}</div>
                      <div className="text-xs text-slate-500">
                        {new Date(d.data).toLocaleDateString('pt-BR')} · {d.categoria} · {tamanhoFmt(d.tamanho)} · {d.destinatarios_resumo} · por {d.publicado_nome}
                      </div>
                      {d.descricao && <div className="text-xs text-slate-400 truncate">{d.descricao}</div>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button variant="outline" size="sm" asChild>
                      <a href={`/api/documentos/${d.id}/download`} target="_blank" rel="noreferrer">
                        <Download className="w-4 h-4 mr-1" /> Baixar
                      </a>
                    </Button>
                    {ehEquipe && (user?.perfil !== 'PROFESSOR' || d.publicado_por === user?.id) && (
                      <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700" onClick={() => excluir(d)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Publicar documento</DialogTitle>
            <DialogDescription>
              O arquivo fica armazenado no banco de dados (GridFS) e o acesso é validado pelo servidor.
              Formatos: PDF, Word, Excel, PowerPoint, CSV, texto e imagens (até 10 MB).
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="doc-nome">Nome do documento</Label>
              <Input id="doc-nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Ex.: Calendário de provas" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="doc-categoria">Categoria</Label>
                <Input id="doc-categoria" value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} placeholder="Ex.: Avisos" />
              </div>
              <div className="grid gap-2">
                <Label>Compartilhar com</Label>
                <Select value={form.escopo} onValueChange={(v) => setForm({ ...form, escopo: v })}>
                  <SelectTrigger className="w-full bg-white"><SelectValue placeholder="Escopo" /></SelectTrigger>
                  <SelectContent>
                    {(user?.perfil === 'ADMIN' || user?.perfil === 'COORDENADOR') && <SelectItem value="institucional">Toda a instituição</SelectItem>}
                    <SelectItem value="turmas">Turmas específicas</SelectItem>
                    <SelectItem value="alunos">Alunos específicos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="doc-descricao">Descrição (opcional)</Label>
              <Textarea id="doc-descricao" rows={2} value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
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

            <div className="grid gap-2">
              <Label htmlFor="doc-arquivo">Arquivo</Label>
              <Input id="doc-arquivo" type="file" ref={fileRef}
                onChange={(e) => setArquivo(e.target.files?.[0] || null)}
                accept=".pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.webp" />
            </div>
            {erro && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{erro}</div>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogAberto(false)} disabled={salvando}>Cancelar</Button>
            <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={publicar}
              disabled={salvando || !form.nome.trim() || !arquivo ||
                (form.escopo === 'turmas' && turmasSelecionadas.length === 0) ||
                (form.escopo === 'alunos' && matriculasSelecionadas.length === 0)}>
              {salvando ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Upload className="w-4 h-4 mr-1" />} Publicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
