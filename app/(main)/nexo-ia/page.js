'use client';

import { useEffect, useRef, useState } from 'react';
import { Header } from '@/components/nexos/header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Sparkles, Send, Loader2, Brain, Users, AlertTriangle, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';

const SUGGESTIONS = [
  { icon: AlertTriangle, text: 'Quais alunos estão com maior risco de queda no desempenho?' },
  { icon: Users,         text: 'Quais turmas têm mais faltas nas últimas 4 semanas?' },
  { icon: TrendingUp,    text: 'Me mostre um resumo do desempenho da turma 7º A.' },
  { icon: Brain,         text: 'Quais são os principais pontos de atenção dos alunos?' },
];

export default function NexoIAPage() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [userName, setUserName] = useState('');
  const scrollRef = useRef(null);

  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem('nexos_user') || 'null');
      if (u) setUserName(u.nome.split(' ')[0]);
    } catch {}
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading, streamingText]);

  const send = async (text) => {
    const message = (text ?? input).trim();
    if (!message || loading) return;
    setInput('');
    const prevMsgs = messages;
    const nextMsgs = [...prevMsgs, { role: 'user', content: message }];
    setMessages(nextMsgs);
    setLoading(true);
    setStreamingText('');

    try {
      const r = await fetch('/api/nexo-ia/chat?stream=true', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, history: prevMsgs, sessionId }),
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
      let finalSession = sessionId;

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
            if (payload.error) throw new Error(payload.error);
            if (payload.sessionId) finalSession = payload.sessionId;
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
      if (finalSession) setSessionId(finalSession);
      setMessages([...nextMsgs, { role: 'assistant', content: finalReply || accumulated }]);
    } catch (e) {
      toast.error('Erro de conexão: ' + e.message);
      setMessages([...nextMsgs, { role: 'assistant', content: 'Desculpe, houve um erro de conexão.' }]);
    } finally {
      setLoading(false);
      setStreamingText('');
    }
  };

  const empty = messages.length === 0 && !loading;

  return (
    <div className="h-screen flex flex-col">
      <Header title="Nexo IA" subtitle="Análises inteligentes para um acompanhamento mais completo." showSearch={false} />

      <div className="flex-1 min-h-0 px-8 pb-6">
        <Card className="h-full border-slate-200 shadow-none flex flex-col overflow-hidden">
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-6">
            {empty ? (
              <div className="max-w-2xl mx-auto">
                <div className="flex items-start gap-3 mb-6">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center shadow-sm">
                    <Sparkles className="w-5 h-5 text-white" />
                  </div>
                  <div className="bg-slate-50 rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-slate-800">
                    <div className="font-medium mb-1">Olá, {userName || 'seja bem-vindo(a)'}! 👋</div>
                    Sou a Nexo IA, sua assistente de dados escolares. Posso ajudar a identificar padrões,
                    gerar insights e apoiar no acompanhamento dos seus alunos.
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-6">
                  {SUGGESTIONS.map((s) => {
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
                      {m.content}
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
                        <span className="whitespace-pre-wrap leading-relaxed">
                          {streamingText}<span className="inline-block w-1.5 h-4 bg-indigo-400 ml-0.5 align-middle animate-pulse" />
                        </span>
                      ) : (
                        <span className="text-slate-500 flex items-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" /> Pensando…
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
              Powered by Gemini 2.5 · Respostas em streaming · valide decisões críticas.
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
