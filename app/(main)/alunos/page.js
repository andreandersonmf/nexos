'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Header } from '@/components/nexos/header';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, Plus, MoreHorizontal, Loader2 } from 'lucide-react';

export default function AlunosPage() {
  const [q, setQ] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/alunos${q ? `?q=${encodeURIComponent(q)}` : ''}`);
        const data = await r.json();
        setItems(data.items || []);
      } finally { setLoading(false); }
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div>
      <Header title="Alunos" subtitle="Gerencie o cadastro, situação acadêmica e histórico dos alunos." showSearch={false} />
      <div className="px-8 pb-8">
        <Card className="p-5 border-slate-200 shadow-none">
          <div className="flex items-center justify-between mb-4 gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar aluno…" className="pl-9" />
            </div>
            <Button className="bg-indigo-600 hover:bg-indigo-700">
              <Plus className="w-4 h-4 mr-1" /> Novo aluno
            </Button>
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
                {!loading && items.length === 0 && (
                  <TableRow><TableCell colSpan={4} className="py-10 text-center text-slate-500">Nenhum aluno encontrado.</TableCell></TableRow>
                )}
                {!loading && items.map((a) => {
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
                          {a.status === 'ATIVO' ? 'Ativo' : a.status}
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
            <div>Mostrando {items.length} aluno(s)</div>
            <div>10 por página</div>
          </div>
        </Card>
      </div>
    </div>
  );
}
