'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Header } from '@/components/nexos/header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { GraduationCap, Loader2, MessageSquare, Send, BookOpen, Users2 } from 'lucide-react';
import { useAuth } from '@/components/nexos/auth-provider';
import { api } from '@/lib/client/api';

export default function ProfessoresPage() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const [conversas, setConversas] = useState([]);
  const [conversaAtiva, setConversaAtiva] = useState(null); // usuario_id
  const [mensagens, setMensagens] = useState([]);
  const [novaMsg, setNovaMsg] = useState('');
  const [enviando, setEnviando] = useState(false);

  const [dialogNova, setDialogNova] = useState(false);
  const [destSelecionado, setDestSelecionado] = useState('');
  const [pessoas, setPessoas] = useState([]);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api('/professores');
      setItems(d.items || []);
    } finally {
      setLoading(false);
    }
  }, []);

  const carregarConversas = useCallback(async () => {
    try {
      const d = await api('/mensagens/conversas');
      setConversas(d.conversas || []);
    } catch { /* página de conversas pode não ser acessível */ }
  }, []);

  useEffect(() => { carregar(); carregarConversas(); }, [carregar, carregarConversas]);

  useEffect(() => {
    const t = setInterval(carregarConversas, 15000);
    return () => clearInterval(t);
  }, [carregarConversas]);

  useEffect(() => {
    if (!conversaAtiva) { setMensagens([]); return; }
    let ativo = true;
    (async () => {
      try {
        const d = await api(`/mensagens/${conversaAtiva}`);
        if (ativo) setMensagens(d.mensagens || []);
      } catch { if (ativo) setMensagens([]); }
    })();
    return () => { ativo = false; };
  }, [conversaAtiva]);

  useEffect(() => {
    const t = setInterval(async () => {
      if (!conversaAtiva) return;
      try {
        const d = await api(`/mensagens/${conversaAtiva}`);
        setMensagens(d.mensagens || []);
        carregarConversas();
      } catch { /* ignora */ }
    }, 10000);
    return () => clearInterval(t);
  }, [conversaAtiva, carregarConversas]);

  const enviar = async () => {
    if (!novaMsg.trim() || !conversaAtiva) return;
    setEnviando(true);
    try {
      await api('/mensagens', { method: 'POST', body: { destinatario_id: Number(conversaAtiva), conteudo: novaMsg } });
      setNovaMsg('');
      const d = await api(`/mensagens/${conversaAtiva}`);
      setMensagens(d.mensagens || []);
      carregarConversas();
    } catch (e) {
      alert(e.message || 'Não foi possível enviar a mensagem.');
    } finally {
      setEnviando(false);
    }
  };

  const abrirNovaConversa = async () => {
    setDialogNova(true);
    setDestSelecionado('');
    try {
      const d = await api('/usuarios');
      const alvo = (d.items || []).filter((u) =>
        ['ADMIN', 'COORDENADOR', 'PROFESSOR'].includes(u.perfil) && u.id !== user?.id
      );
      setPessoas(alvo);
    } catch {
      const staff = items.filter((p) => p.id !== user?.id);
      setPessoas(staff);
    }
  };

  return (
    <div>
      <Header title="Professores" subtitle="Equipe docente e mensagens internas." showSearch={false} />
      <div className="px-8 pb-8 space-y-6">
        {loading ? (
          <div className="flex items-center gap-2 text-slate-500 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando professores…
          </div>
        ) : items.length === 0 ? (
          <Card className="p-10 text-center text-sm text-slate-500">Nenhum professor cadastrado.</Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((p) => {
              const iniciais = p.nome.split(' ').map((n) => n[0]).slice(0, 2).join('');
              return (
                <Card key={p.id} className="p-5 border-slate-200 shadow-none">
                  <div className="flex items-start gap-3">
                    <Avatar className="h-11 w-11">
                      <AvatarFallback className="bg-violet-100 text-violet-700">{iniciais}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-slate-900">{p.nome}</div>
                      <div className="text-xs text-slate-500">{p.cargo || 'Professor(a)'}</div>
                      <div className="text-xs text-slate-400 truncate">{p.email}</div>
                    </div>
                  </div>
                  <div className="mt-4 space-y-2">
                    {(p.turmas_nomes || []).length > 0 && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <Users2 className="w-3.5 h-3.5 text-slate-400" />
                        {p.turmas_nomes.map((t) => (
                          <span key={t} className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">{t}</span>
                        ))}
                      </div>
                    )}
                    {(p.disciplinas_nomes || []).length > 0 && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <BookOpen className="w-3.5 h-3.5 text-slate-400" />
                        {p.disciplinas_nomes.map((d) => (
                          <span key={d} className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">{d}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        <Card className="border-slate-200 shadow-none">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-indigo-500" /> Mensagens internas
            </h3>
            <Button variant="outline" size="sm" onClick={abrirNovaConversa} className="border-indigo-200 text-indigo-700 hover:bg-indigo-50">
              <MessageSquare className="w-4 h-4 mr-1" /> Nova conversa
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-[260px,1fr] min-h-[320px]">
            <div className="border-r border-slate-100 overflow-y-auto max-h-[420px]">
              {conversas.length === 0 && (
                <div className="p-5 text-sm text-slate-500">Nenhuma conversa ainda.</div>
              )}
              {conversas.map((c) => (
                <button key={c.usuario_id}
                  onClick={() => setConversaAtiva(c.usuario_id)}
                  className={`w-full text-left p-4 border-b border-slate-50 hover:bg-slate-50 transition-colors ${conversaAtiva === c.usuario_id ? 'bg-indigo-50/60' : ''}`}>
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium text-slate-900 truncate">{c.pessoa.nome}</div>
                    {c.nao_lidas > 0 && (
                      <Badge className="bg-red-100 text-red-700 border-red-200">{c.nao_lidas}</Badge>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 truncate mt-0.5">{c.ultima_mensagem}</div>
                </button>
              ))}
            </div>
            <div className="flex flex-col">
              <div className="flex-1 p-4 space-y-3 overflow-y-auto max-h-[320px]">
                {!conversaAtiva && (
                  <div className="h-full flex items-center justify-center text-sm text-slate-400">
                    Selecione uma conversa ou inicie uma nova.
                  </div>
                )}
                {mensagens.map((m) => {
                  const minha = m.remetente_id === user?.id;
                  return (
                    <div key={m.id} className={`flex ${minha ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${minha ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-800'}`}>
                        <div>{m.conteudo}</div>
                        <div className={`text-[10px] mt-1 ${minha ? 'text-indigo-200' : 'text-slate-400'}`}>
                          {new Date(m.data).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {conversaAtiva && (
                <div className="p-3 border-t border-slate-100 flex items-center gap-2">
                  <Input value={novaMsg} onChange={(e) => setNovaMsg(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } }}
                    placeholder="Escreva uma mensagem…" className="bg-white" />
                  <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700" onClick={enviar} disabled={enviando || !novaMsg.trim()}>
                    {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </Card>
      </div>

      <Dialog open={dialogNova} onOpenChange={setDialogNova}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nova conversa</DialogTitle>
            <DialogDescription>Inicie uma conversa com um membro da equipe.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Destinatário</Label>
              <Select value={destSelecionado} onValueChange={setDestSelecionado}>
                <SelectTrigger className="w-full bg-white"><SelectValue placeholder="Selecione a pessoa" /></SelectTrigger>
                <SelectContent>
                  {pessoas.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.nome} ({p.perfil})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogNova(false)}>Cancelar</Button>
            <Button className="bg-indigo-600 hover:bg-indigo-700" disabled={!destSelecionado}
              onClick={() => { setConversaAtiva(Number(destSelecionado)); setDialogNova(false); }}>
              <MessageSquare className="w-4 h-4 mr-1" /> Abrir conversa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
