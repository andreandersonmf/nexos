'use client';

import { useEffect, useRef, useState } from 'react';
import { Header } from '@/components/nexos/header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Sparkles, Send, Loader2, Brain, Users, AlertTriangle, TrendingUp,
  Plus, MessageSquare, GraduationCap, BookOpen, CalendarCheck, Pencil, Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/components/nexos/auth-provider';
import { api } from '@/lib/client/api';

const SUGGESTIONS_POR_PERFIL = {
  ALUNO: [
    { icon: TrendingUp,    text: 'Como está minha média geral e em quais disciplinas posso melhorar?' },
    { icon: CalendarCheck, text: 'Como está minha frequência nas aulas?' },
    { icon: BookOpen,      text: 'Quais comunicados eu ainda não li?' },
    { icon: Brain,         text: 'Você pode me explicar frações de um jeito simples?' },
  ],
  PROFESSOR: [
    { icon: AlertTriangle, text: 'Quais alunos das minhas turmas estão com risco de queda no desempenho?' },
    { icon: CalendarCheck, text: 'Como está a frequência das minhas turmas?' },
    { icon: TrendingUp,    text: 'Qual a evolução recente do desempenho das minhas turmas?' },
    { icon: Brain,         text: 'Quais são os principais pontos de atenção dos meus alunos?' },
  ],
  ADMIN: [
    { icon: Users,         text: 'Me dê um resumo dos indicadores institucionais da escola.' },
    { icon: AlertTriangle, text: 'Quais alunos estão em maior risco em toda a escola?' },
    { icon: TrendingUp,    text: 'Compare o desempenho médio das turmas.' },
    { icon: Brain,         text: 'Quais são os principais pontos de atenção da escola?' },
  ],
  COORDENADOR: [
    { icon: Users,         text: 'Me dê um resumo dos indicadores institucionais da escola.' },
    { icon: AlertTriangle, text: 'Quais alunos estão em maior risco em toda a escola?' },
    { icon: TrendingUp,    text: 'Compare o desempenho médio das turmas.' },
    { icon: Brain,         text: 'Quais são os principais pontos de atenção da escola?' },
  ],
 };

// Renderiza Markdown básico sem injetar HTML arbitrário na página.
function renderInlineMarkdown(text, keyPrefix = 'md') {
  const pattern = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*|_[^_\n]+_|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g;
  const parts = String(text || '').split(pattern);
  return parts.map((part, index) => {
    const key = `${keyPrefix}-${index}`;
    if ((part.startsWith('**') && part.endsWith('**')) || (part.startsWith('__') && part.endsWith('__'))) {
      return <strong key={key}>{part.slice(2, -2)}</strong>;
    }
    if ((part.startsWith('*') && part.endsWith('*')) || (part.startsWith('_') && part.endsWith('_'))) {
      return <em key={key}>{part.slice(1, -1)}</em>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={key} className="rounded bg-slate-200/70 px-1 py-0.5 text-[0.9em] font-mono">{part.slice(1, -1)}</code>;
    }
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
    if (link) return <a key={key} href={link[2]} target="_blank" rel="noopener noreferrer" className="text-indigo-700 underline underline-offset-2">{link[1]}</a>;
    return part;
  });
}

function MarkdownMessage({ content }) {
  const lines = String(content || '').replace(/\r/g, '').split('\n');
  const blocks = [];
  let paragraph = [];
  let listItems = [];
  let listType = null;
  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push(<p key={`p-${blocks.length}`} className="my-2 first:mt-0 last:mb-0">{paragraph.map((line, i) => <span key={i}>{i > 0 && <br />}{renderInlineMarkdown(line, `p-${blocks.length}-${i}`)}</span>)}</p>);
      paragraph = [];
    }
  };
  const flushList = () => {
    if (!listItems.length) return;
    const Tag = listType === 'ol' ? 'ol' : 'ul';
    blocks.push(<Tag key={`list-${blocks.length}`} className={`${listType === 'ol' ? 'list-decimal' : 'list-disc'} my-2 space-y-1 pl-5`}>{listItems.map((item, i) => <li key={i}>{renderInlineMarkdown(item, `li-${blocks.length}-${i}`)}</li>)}</Tag>);
    listItems = [];
    listType = null;
  };
  lines.forEach((line) => {
    const heading = line.match(/^\s*(#{1,3})\s+(.+)$/);
    const bullet = line.match(/^\s*[-*+]\s+(.+)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (!line.trim()) { flushParagraph(); flushList(); return; }
    if (heading) {
      flushParagraph(); flushList();
      const level = heading[1].length;
      const cls = level === 1 ? 'mt-4 mb-2 text-lg font-bold first:mt-0' : level === 2 ? 'mt-3 mb-1.5 text-base font-bold' : 'mt-3 mb-1 text-sm font-semibold';
      const Tag = `h${level}`;
      blocks.push(<Tag key={`h-${blocks.length}`} className={cls}>{renderInlineMarkdown(heading[2], `h-${blocks.length}`)}</Tag>);
      return;
    }
    if (bullet || numbered) {
      flushParagraph();
      const nextType = numbered ? 'ol' : 'ul';
      if (listType && listType !== nextType) flushList();
      listType = nextType;
      listItems.push((bullet || numbered)[1]);
      return;
    }
    flushList();
    paragraph.push(line);
  });
  flushParagraph(); flushList();
  return <div className="markdown-message break-words">{blocks}</div>;
}

export default function NexoIAPage() {
  const { user } = useAuth();
  const perfil = user?.perfil || 'PROFESSOR';
  const suggestions = SUGGESTIONS_POR_PERFIL[perfil] || SUGGESTIONS_POR_PERFIL.PROFESSOR;

  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [conversaId, setConversaId] = useState(null);
  const [conversas, setConversas] = useState([]);
  const [carregandoHistorico, setCarregandoHistorico] = useState(true);
  const scrollRef = useRef(null);

  const carregarConversas = async () => {
    try {
      const d = await api('/nexo-ia/historico');
      setConversas(d.conversas || []);
    } catch {
      setConversas([]);
    } finally {
      setCarregandoHistorico(false);
    }
  };

  useEffect(() => { carregarConversas(); }, []);

  const abrirConversa = async (id) => {
    if (loading) return;
    try {
      const d = await api(`/nexo-ia/historico?conversa_id=${id}`);
      setConversaId(id);
      setMessages(d.conversa?.mensagens || []);
      setStreamingText('');
    } catch (e) {
      toast.error(e.message || 'Não foi possível abrir a conversa.');
    }
  };

  const renomearConversa = async (conversa) => {
    if (loading) return;
    const titulo = window.prompt('Digite o novo nome da conversa:', conversa.titulo || 'Nova conversa');
    if (titulo === null) return;
    const nome = titulo.trim();
    if (!nome) { toast.error('O nome da conversa não pode ficar vazio.'); return; }
    try {
      await api(`/nexo-ia/conversas/${conversa.id}`, { method: 'PATCH', body: { titulo: nome } });
      setConversas((anteriores) => anteriores.map((item) => item.id === conversa.id ? { ...item, titulo: nome } : item));
      toast.success('Conversa renomeada.');
    } catch (e) { toast.error(e.message || 'Não foi possível renomear a conversa.'); }
  };

  const excluirConversa = async (conversa) => {
    if (loading) return;
    if (!window.confirm(`Excluir a conversa “${conversa.titulo || 'Nova conversa'}”? Essa ação não pode ser desfeita.`)) return;
    try {
      await api(`/nexo-ia/conversas/${conversa.id}`, { method: 'DELETE' });
      setConversas((anteriores) => anteriores.filter((item) => item.id !== conversa.id));
      if (conversaId === conversa.id) {
        setConversaId(null);
        setMessages([]);
        setStreamingText('');
      }
      toast.success('Conversa excluída.');
    } catch (e) { toast.error(e.message || 'Não foi possível excluir a conversa.'); }
  };

  const novaConversa = () => {
    if (loading) return;
    setConversaId(null);
    setMessages([]);
    setStreamingText('');
  };

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading, streamingText]);

  const send = async (text) => {
    const message = (text ?? input).trim();
    if (!message || loading) return;
    setInput('');
    const nextMsgs = [...messages, { role: 'user', content: message }];
    setMessages(nextMsgs);
    setLoading(true);
    setStreamingText('');

    try {
      const r = await fetch('/api/nexo-ia/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, conversaId }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        toast.error(data.error || `HTTP ${r.status}`);
        setMessages([...nextMsgs, { role: 'assistant', content: `Desculpe, ocorreu um erro: ${data.error || r.status}` }]);
        return;
      }
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulated = '';
      let finalReply = '';
      let streamError = '';
      let finalConversaId = conversaId;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';
        for (const evt of events) {
          const line = evt.split('\n').find((l) => l.startsWith('data: '));
          if (!line) continue;
          try {
            const payload = JSON.parse(line.slice(6));
            if (payload.error) { streamError = payload.error; continue; }
            if (payload.conversaId) finalConversaId = payload.conversaId;
            if (payload.delta) {
              accumulated += payload.delta;
              setStreamingText(accumulated);
            }
            if (payload.done) {
              finalReply = payload.reply || accumulated;
            }
          } catch (e) {
            console.error('SSE parse error:', e);
          }
        }
      }
      if (finalConversaId) setConversaId(finalConversaId);
      if (streamError) {
        toast.error(streamError);
        setMessages([...nextMsgs, { role: 'assistant', content: `Desculpe, ocorreu um erro: ${streamError}` }]);
      } else {
        setMessages([...nextMsgs, { role: 'assistant', content: finalReply || accumulated || 'Não foi possível gerar uma resposta. Tente novamente.' }]);
      }
      carregarConversas();
    } catch (e) {
      toast.error('Erro de conexão: ' + e.message);
      setMessages([...nextMsgs, { role: 'assistant', content: 'Desculpe, houve um erro de conexão.' }]);
    } finally {
      setLoading(false);
      setStreamingText('');
    }
  };

  const empty = messages.length === 0 && !loading;
  const nome = user?.nome?.split(' ')[0] || '';

  return (
    <div className="h-screen flex flex-col">
      <Header title="Nexo IA" subtitle="Análises inteligentes para um acompanhamento mais completo." showSearch={false} />

      <div className="flex-1 min-h-0 px-8 pb-6 flex gap-4">
        {/* Histórico de conversas */}
        <Card className="w-60 shrink-0 border-slate-200 shadow-none hidden md:flex flex-col overflow-hidden">
          <div className="p-3 border-b border-slate-100">
            <Button variant="outline" size="sm" className="w-full justify-start text-indigo-700 border-indigo-200 hover:bg-indigo-50"
              onClick={novaConversa}>
              <Plus className="w-4 h-4 mr-1" /> Nova conversa
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {carregandoHistorico && (
              <div className="p-3 text-xs text-slate-400 flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando…
              </div>
            )}
            {!carregandoHistorico && conversas.length === 0 && (
              <div className="p-3 text-xs text-slate-400">Nenhuma conversa anterior.</div>
            )}
            {conversas.map((c) => (
              <div key={c.id} className={`group mb-1 rounded-lg transition-colors ${conversaId === c.id ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}>
                <div className="flex items-start gap-1 p-2.5 pb-1">
                  <button type="button" onClick={() => abrirConversa(c.id)}
                    className="flex min-w-0 flex-1 items-start gap-2 text-left text-xs" title={c.titulo}>
                    <MessageSquare className="mt-0.5 w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{c.titulo || 'Nova conversa'}</span>
                  </button>
                  <div className="flex shrink-0 gap-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
                    <button type="button" onClick={() => renomearConversa(c)} title="Renomear conversa" aria-label={`Renomear ${c.titulo}`}
                      className="rounded p-1 text-slate-400 hover:bg-white hover:text-indigo-600">
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button type="button" onClick={() => excluirConversa(c)} title="Excluir conversa" aria-label={`Excluir ${c.titulo}`}
                      className="rounded p-1 text-slate-400 hover:bg-white hover:text-red-600">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
                <div className="pb-2 pl-8 text-[10px] text-slate-400">
                  {new Date(c.atualizado_em).toLocaleDateString('pt-BR')}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="flex-1 min-w-0 border-slate-200 shadow-none flex flex-col overflow-hidden">
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-6">
            {empty ? (
              <div className="max-w-2xl mx-auto">
                <div className="flex items-start gap-3 mb-6">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center shadow-sm">
                    <Sparkles className="w-5 h-5 text-white" />
                  </div>
                  <div className="bg-slate-50 rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-slate-800">
                    <div className="font-medium mb-1">Olá, {nome || 'seja bem-vindo(a)'}!</div>
                    {perfil === 'ALUNO'
                      ? 'Sou a Nexo IA. Posso consultar suas notas e frequência, mostrar comunicados e também ajudar com dúvidas de estudo.'
                      : perfil === 'PROFESSOR'
                        ? 'Sou a Nexo IA. Posso analisar os dados das suas turmas — sempre de forma agregada — e ajudar no acompanhamento dos alunos.'
                        : 'Sou a Nexo IA. Posso gerar indicadores institucionais, comparar turmas e identificar alunos em risco.'}
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-6">
                  {suggestions.map((s) => {
                    const Icon = s.icon;
                    return (
                      <button key={s.text} onClick={() => send(s.text)} disabled={loading}
                        className="text-left p-4 rounded-xl border border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/40 transition-colors group">
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center flex-shrink-0 group-hover:bg-indigo-200">
                            <Icon className="w-4 h-4" />
                          </div>
                          <div className="text-sm text-slate-700">{s.text}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="max-w-3xl mx-auto space-y-5">
                {messages.map((m, i) => (
                  <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : ''}`}>
                    {m.role === 'assistant' && (
                      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center flex-shrink-0">
                        <Sparkles className="w-4 h-4 text-white" />
                      </div>
                    )}
                    <div className={`max-w-[80%] px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed ${
                      m.role === 'user'
                        ? 'bg-indigo-600 text-white rounded-2xl rounded-tr-sm'
                        : 'bg-slate-50 text-slate-800 rounded-2xl rounded-tl-sm'
                    }`}>
                      {m.role === 'assistant' ? <MarkdownMessage content={m.content} /> : m.content}
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex gap-3">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center flex-shrink-0">
                      <Sparkles className="w-4 h-4 text-white" />
                    </div>
                    <div className="bg-slate-50 rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-slate-800 min-h-[44px] flex items-center">
                      {streamingText ? (
                        <span className="leading-relaxed">
                          <MarkdownMessage content={streamingText} /><span className="inline-block w-1.5 h-4 bg-indigo-400 ml-0.5 align-middle animate-pulse" />
                        </span>
                      ) : (
                        <span className="text-slate-500 flex items-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" /> Consultando dados…
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="border-t border-slate-200 p-4">
            <div className="max-w-3xl mx-auto flex gap-2 items-end">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder="Digite sua pergunta…"
                rows={1}
                className="resize-none min-h-[44px] max-h-32 border-slate-200"
              />
              <Button onClick={() => send()} disabled={loading || !input.trim()}
                className="h-11 w-11 p-0 bg-indigo-600 hover:bg-indigo-700">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>
            <div className="max-w-3xl mx-auto mt-2 text-[11px] text-slate-400 text-center">
              Powered by Gemini · Respostas em streaming · {perfil === 'ALUNO' ? 'consultas restritas aos seus próprios dados' : 'consultas restritas ao seu escopo de acesso'}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
