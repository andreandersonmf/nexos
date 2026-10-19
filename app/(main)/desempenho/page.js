'use client';

import { useEffect, useMemo, useState } from 'react';
import { Header } from '@/components/nexos/header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Save, CheckCircle2, PenLine } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { toast } from 'sonner';
import { useAuth } from '@/components/nexos/auth-provider';
import { api } from '@/lib/client/api';

function notaColor(v) {
  if (v == null) return 'text-slate-300';
  if (v < 6) return 'text-red-600';
  if (v < 7.5) return 'text-amber-600';
  return 'text-emerald-600';
}
function notaFmt(v) { return v != null ? v.toFixed(1).replace('.', ',') : '—'; }

function DesempenhoAluno() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.matricula_aluno) return;
    (async () => {
      try {
        setData(await api(`/alunos/${user.matricula_aluno}`));
      } catch (e) {
        toast.error(e.message || 'Não foi possível carregar suas notas.');
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  if (loading) {
    return (
      <Card className="p-10 border-slate-200 shadow-none text-center">
        <Loader2 className="w-5 h-5 animate-spin text-slate-400 mx-auto" />
      </Card>
    );
  }
  if (!data) {
    return (
      <Card className="p-10 border-slate-200 shadow-none text-center">
        <div className="text-slate-500 text-sm">Não foi possível carregar seu desempenho.</div>
      </Card>
    );
  }
  const { notas, historico, evolucao } = data;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {notas.map((n) => (
          <Card key={n.disciplina} className="p-4 border-slate-200 shadow-none">
            <div className="text-xs text-slate-500 mb-1">{n.disciplina}</div>
            <div className={`text-3xl font-semibold ${notaColor(n.media)}`}>{notaFmt(n.media)}</div>
            <div className="text-xs text-slate-400 mt-1">Média geral</div>
          </Card>
        ))}
      </div>

      {evolucao.length > 0 && (
        <Card className="p-5 border-slate-200 shadow-none">
          <div className="text-sm font-semibold text-slate-900 mb-4">Evolução da média por bimestre</div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={evolucao}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="bimestre" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 10]} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v) => notaFmt(Number(v))} contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }} />
                <Line type="monotone" dataKey="media" stroke="#6366f1" strokeWidth={2} dot={{ r: 4, fill: '#6366f1' }} name="Média" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      <Card className="border-slate-200 shadow-none">
        <div className="p-5 border-b border-slate-100">
          <h3 className="text-base font-semibold text-slate-900">Histórico de notas</h3>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50 hover:bg-slate-50">
              <TableHead>Bimestre</TableHead>
              {notas.map((n) => <TableHead key={n.disciplina}>{n.disciplina}</TableHead>)}
              <TableHead>Média</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {historico.map((row) => (
              <TableRow key={row.bimestre}>
                <TableCell className="font-medium">{row.bimestre}</TableCell>
                {notas.map((n) => (
                  <TableCell key={n.disciplina} className={notaColor(row[n.disciplina])}>{notaFmt(row[n.disciplina])}</TableCell>
                ))}
                <TableCell className={`font-semibold ${notaColor(row['Média'])}`}>{notaFmt(row['Média'])}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function LancamentoNotas() {
  const { user } = useAuth();
  const [turmas, setTurmas] = useState([]);
  const [disciplinas, setDisciplinas] = useState([]);
  const [turmaId, setTurmaId] = useState('');
  const [discId, setDiscId] = useState('');
  const [bimestre, setBimestre] = useState('1');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState({});

  useEffect(() => {
    (async () => {
      try {
        const [tR, dR] = await Promise.all([api('/turmas'), api('/disciplinas')]);
        let listaTurmas = tR.items || [];
        if (user?.perfil === 'PROFESSOR') {
          listaTurmas = listaTurmas.filter((t) => (user.turmas || []).includes(Number(t.id)));
        }
        setTurmas(listaTurmas);
        let listaDisc = dR.items || [];
        if (user?.perfil === 'PROFESSOR' && (user.disciplinas || []).length) {
          listaDisc = listaDisc.filter((d) => (user.disciplinas || []).includes(Number(d.id)));
        }
        setDisciplinas(listaDisc);
      } catch (e) {
        toast.error(e.message || 'Falha ao carregar turmas e disciplinas.');
      }
    })();
  }, [user]);

  useEffect(() => {
    if (!turmaId || !discId || !bimestre) { setItems([]); return; }
    setLoading(true);
    api(`/notas?turma_id=${turmaId}&disciplina_id=${discId}&bimestre=${bimestre}`)
      .then((d) => { setItems(d.items || []); setDirty({}); })
      .catch((e) => toast.error(e.message || 'Falha ao carregar notas.'))
      .finally(() => setLoading(false));
  }, [turmaId, discId, bimestre]);

  const changed = useMemo(() => Object.keys(dirty).length > 0, [dirty]);

  const setValor = (matricula, raw) => {
    const v = raw === '' ? null : raw.replace(',', '.');
    setItems((prev) => prev.map((i) => i.matricula === matricula ? { ...i, valor: v } : i));
    setDirty((d) => ({ ...d, [matricula]: true }));
  };

  const salvar = async () => {
    setSaving(true);
    try {
      const payload = {
        turma_id: parseInt(turmaId),
        disciplina_id: parseInt(discId),
        bimestre: parseInt(bimestre),
        notas: items.map((i) => ({
          matricula_aluno: i.matricula,
          valor: i.valor === '' || i.valor == null ? null : parseFloat(i.valor),
        })),
      };
      const data = await api('/notas/batch', { method: 'POST', body: payload });
      toast.success(`${data.gravadas || 0} nota(s) salva(s). Alertas foram recalculados.`);
      setDirty({});
    } catch (e) {
      toast.error(e.message || 'Falha ao salvar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-5 border-slate-200 shadow-none">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1.5 block">Turma</label>
            <Select value={turmaId} onValueChange={setTurmaId}>
              <SelectTrigger><SelectValue placeholder="Selecione a turma" /></SelectTrigger>
              <SelectContent>
                {turmas.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.nome} · {t.turno}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1.5 block">Disciplina</label>
            <Select value={discId} onValueChange={setDiscId}>
              <SelectTrigger><SelectValue placeholder="Selecione a disciplina" /></SelectTrigger>
              <SelectContent>
                {disciplinas.map((d) => <SelectItem key={d.id} value={String(d.id)}>{d.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1.5 block">Bimestre</label>
            <Select value={bimestre} onValueChange={setBimestre}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1º Bimestre</SelectItem>
                <SelectItem value="2">2º Bimestre</SelectItem>
                <SelectItem value="3">3º Bimestre</SelectItem>
                <SelectItem value="4">4º Bimestre</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {!turmaId || !discId ? (
        <Card className="p-10 border-slate-200 shadow-none text-center">
          <PenLine className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <div className="text-slate-500 text-sm">Selecione turma e disciplina para começar.</div>
        </Card>
      ) : loading ? (
        <Card className="p-10 border-slate-200 shadow-none text-center">
          <Loader2 className="w-5 h-5 animate-spin text-slate-400 mx-auto" />
        </Card>
      ) : (
        <Card className="border-slate-200 shadow-none">
          <div className="flex items-center justify-between p-5 border-b border-slate-100">
            <div>
              <div className="text-sm font-semibold text-slate-900">
                {items.length} aluno(s) · {bimestre}º Bimestre
              </div>
              <div className="text-xs text-slate-500 mt-0.5">Valores de 0 a 10. Deixe em branco para remover.</div>
            </div>
            <Button onClick={salvar} disabled={!changed || saving}
              className="bg-indigo-600 hover:bg-indigo-700">
              {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Salvando…</>
                : <><Save className="w-4 h-4 mr-2" /> Salvar notas</>}
            </Button>
          </div>
          <ul className="divide-y divide-slate-100">
            {items.map((a) => {
              const iniciais = a.nome.split(' ').map((n) => n[0]).slice(0, 2).join('');
              const edited = dirty[a.matricula];
              return (
                <li key={a.matricula} className="flex items-center gap-4 px-5 py-3">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="bg-indigo-100 text-indigo-700 text-xs">{iniciais}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-slate-900">{a.nome}</div>
                    <div className="text-xs text-slate-400">{a.matricula}</div>
                  </div>
                  {edited && <CheckCircle2 className="w-4 h-4 text-amber-500" />}
                  <Input
                    type="number" step="0.1" min="0" max="10"
                    value={a.valor ?? ''}
                    onChange={(e) => setValor(a.matricula, e.target.value)}
                    placeholder="—"
                    className="w-24 text-center"
                  />
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}

export default function DesempenhoPage() {
  const { user } = useAuth();
  const ehAluno = ['ALUNO', 'RESPONSAVEL'].includes(user?.perfil);
  return (
    <div>
      <Header title={ehAluno ? 'Meu desempenho' : 'Desempenho — Lançamento de Notas'}
        subtitle={ehAluno ? 'Suas notas e evolução por bimestre.' : 'Selecione turma, disciplina e bimestre para registrar as notas.'}
        showSearch={false} />
      <div className="px-8 pb-8">
        {ehAluno ? <DesempenhoAluno /> : <LancamentoNotas />}
      </div>
    </div>
  );
}
