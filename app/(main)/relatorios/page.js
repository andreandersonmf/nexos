'use client';

import { useEffect, useState } from 'react';
import { Header } from '@/components/nexos/header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BarChart3, Download, Loader2, Table2 } from 'lucide-react';
import { useAuth } from '@/components/nexos/auth-provider';
import { api } from '@/lib/client/api';

const TIPOS = [
  { id: 'indicadores', label: 'Indicadores institucionais', precisaTurma: false },
  { id: 'frequencia', label: 'Frequência por aluno', precisaTurma: true },
  { id: 'desempenho', label: 'Desempenho por aluno', precisaTurma: true },
  { id: 'faltas', label: 'Alunos com mais faltas', precisaTurma: true },
  { id: 'quedas', label: 'Quedas de desempenho', precisaTurma: true },
  { id: 'alertas', label: 'Alertas abertos', precisaTurma: true },
];

export default function RelatoriosPage() {
  const { user } = useAuth();
  const [tipo, setTipo] = useState('indicadores');
  const [turmaId, setTurmaId] = useState('');
  const [disciplinaId, setDisciplinaId] = useState('');
  const [turmas, setTurmas] = useState([]);
  const [disciplinas, setDisciplinas] = useState([]);
  const [resultado, setResultado] = useState(null); // {colunas, linhas}
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');

  const tipoAtual = TIPOS.find((t) => t.id === tipo);

  useEffect(() => {
    (async () => {
      try {
        const d = await api('/turmas');
        let lista = d.items || [];
        if (user?.perfil === 'PROFESSOR') lista = lista.filter((t) => (user.turmas || []).includes(Number(t.id)));
        setTurmas(lista);
      } catch { setTurmas([]); }
      try {
        const r = await fetch('/api/desempenho/resumo');
        const d = await r.json();
        setDisciplinas((d.porDisciplina || []).filter((x) => x.disciplina_id != null));
      } catch { setDisciplinas([]); }
    })();
  }, [user]);

  const gerar = async (formato) => {
    setLoading(true);
    setErro('');
    try {
      if (formato === 'csv') {
        const busca = new URLSearchParams({ tipo, formato: 'csv' });
        if (turmaId) busca.set('turma_id', turmaId);
        if (tipo === 'desempenho' && disciplinaId) busca.set('disciplina_id', disciplinaId);
        const d = await api(`/relatorios?${busca}`);
        const blob = new Blob(['\uFEFF' + (d.csv || '')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = d.nome || `nexos_${tipo}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const busca = new URLSearchParams();
        if (turmaId) busca.set('turma_id', turmaId);
        if (tipo === 'desempenho' && disciplinaId) busca.set('disciplina_id', disciplinaId);
        const d = await api(`/relatorios/${tipo}${busca.toString() ? `?${busca}` : ''}`);
        setResultado(d);
      }
    } catch (e) {
      setErro(e.message || 'Não foi possível gerar o relatório.');
      if (formato !== 'csv') setResultado(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <Header title="Relatórios" subtitle="Gere relatórios e exporte para CSV." showSearch={false} />
      <div className="px-8 pb-8 space-y-6">
        <Card className="p-5 border-slate-200 shadow-none">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div className="grid gap-2">
              <Label>Tipo de relatório</Label>
              <Select value={tipo} onValueChange={(v) => { setTipo(v); setResultado(null); }}>
                <SelectTrigger className="w-full bg-white"><SelectValue placeholder="Tipo" /></SelectTrigger>
                <SelectContent>
                  {TIPOS.map((t) => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {tipoAtual?.precisaTurma && (
              <div className="grid gap-2">
                <Label>Turma</Label>
                <Select value={turmaId} onValueChange={(v) => { setTurmaId(v); setResultado(null); }}>
                  <SelectTrigger className="w-full bg-white"><SelectValue placeholder="Selecione a turma" /></SelectTrigger>
                  <SelectContent>
                    {turmas.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {tipo === 'desempenho' && (
              <div className="grid gap-2">
                <Label>Disciplina (opcional)</Label>
                <Select value={disciplinaId} onValueChange={(v) => { setDisciplinaId(v === '__todas' ? '' : v); setResultado(null); }}>
                  <SelectTrigger className="w-full bg-white"><SelectValue placeholder="Todas" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__todas">Todas</SelectItem>
                    {disciplinas.map((d) => (
                      <SelectItem key={d.disciplina_id} value={String(d.disciplina_id)}>{d.disciplina}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex items-center gap-2 md:col-span-2 md:justify-end">
              <Button variant="outline" onClick={() => gerar('tabela')} disabled={loading || (tipoAtual?.precisaTurma && !turmaId)}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Table2 className="w-4 h-4 mr-1" />} Gerar tabela
              </Button>
              <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={() => gerar('csv')} disabled={loading || (tipoAtual?.precisaTurma && !turmaId)}>
                <Download className="w-4 h-4 mr-1" /> Exportar CSV
              </Button>
            </div>
          </div>
          {tipoAtual?.precisaTurma && !turmaId && (
            <div className="mt-3 text-xs text-slate-400">Selecione uma turma para gerar este relatório detalhado.</div>
          )}
          {erro && <div className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{erro}</div>}
        </Card>

        {resultado && (
          <Card className="border-slate-200 shadow-none">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-indigo-500" /> Resultado
              </h3>
              <div className="text-xs text-slate-400">{resultado.linhas.length} linha(s)</div>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 hover:bg-slate-50">
                    {resultado.colunas.map((c) => <TableHead key={c}>{c}</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resultado.linhas.length === 0 && (
                    <TableRow><TableCell colSpan={resultado.colunas.length} className="py-10 text-center text-slate-500">Nenhum dado para o período.</TableCell></TableRow>
                  )}
                  {resultado.linhas.map((l, i) => (
                    <TableRow key={i}>
                      {l.map((v, j) => (
                        <TableCell key={j} className="text-sm">{v == null ? '—' : String(v)}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
