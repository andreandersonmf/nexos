'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Header } from '@/components/nexos/header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Bell, RefreshCw, CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const prioBadge = {
  alta:  'bg-red-100 text-red-700 border-red-200',
  media: 'bg-amber-100 text-amber-700 border-amber-200',
  baixa: 'bg-slate-100 text-slate-600 border-slate-200',
};
const tipoLabel = { frequencia: 'Frequência', desempenho: 'Desempenho' };

export default function AlertasPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [filtro, setFiltro] = useState('aberto');

  const carregar = () => {
    setLoading(true);
    fetch('/api/alertas').then((r) => r.json())
      .then((d) => setItems(d.items || []))
      .finally(() => setLoading(false));
  };
  useEffect(carregar, []);

  const regenerar = async () => {
    setRegenerating(true);
    try {
      const r = await fetch('/api/alertas/regenerar', { method: 'POST' });
      const d = await r.json();
      toast.success(`${d.gerados || 0} alerta(s) gerado(s) pelo motor automático.`);
      carregar();
    } catch (e) { toast.error('Falha ao regenerar.'); }
    finally { setRegenerating(false); }
  };

  const marcarResolvido = async (id) => {
    try {
      await fetch(`/api/alertas/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'resolvido' }),
      });
      setItems((prev) => prev.map((a) => a.id === id ? { ...a, status: 'resolvido' } : a));
      toast.success('Alerta marcado como resolvido.');
    } catch { toast.error('Falha ao atualizar.'); }
  };

  const filtrados = items.filter((a) => filtro === 'todos' || a.status === filtro);

  return (
    <div>
      <Header title="Alertas" subtitle="Monitore riscos de evasão e queda de desempenho." showSearch={false} />
      <div className="px-8 pb-8 space-y-4">
        <Card className="p-5 border-slate-200 shadow-none">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center">
                <Bell className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-900">Motor de alertas automáticos</div>
                <div className="text-xs text-slate-500 mt-0.5">Regras: Frequência &lt; 75% ou Média &lt; 6,0 geram alertas prioritários.</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Select value={filtro} onValueChange={setFiltro}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="aberto">Em aberto</SelectItem>
                  <SelectItem value="resolvido">Resolvidos</SelectItem>
                  <SelectItem value="todos">Todos</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={regenerar} disabled={regenerating}
                className="bg-indigo-600 hover:bg-indigo-700">
                {regenerating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analisando…</>
                  : <><RefreshCw className="w-4 h-4 mr-2" /> Analisar escola</>}
              </Button>
            </div>
          </div>
        </Card>

        <Card className="border-slate-200 shadow-none">
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
              {!loading && filtrados.length === 0 && (
                <TableRow><TableCell colSpan={6} className="py-10 text-center text-slate-500">Nenhum alerta.</TableCell></TableRow>
              )}
              {!loading && filtrados.map((a) => {
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
                    <TableCell className="text-sm text-slate-700">{tipoLabel[a.tipo] || a.tipo}</TableCell>
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
    </div>
  );
}
