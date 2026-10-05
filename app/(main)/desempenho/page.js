'use client';

import { useEffect, useMemo, useState } from 'react';
import { Header } from '@/components/nexos/header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Save, CheckCircle2, PenLine } from 'lucide-react';
import { toast } from 'sonner';

export default function DesempenhoNotasPage() {
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
      const [tR, dR] = await Promise.all([
        fetch('/api/turmas').then((r) => r.json()),
        fetch('/api/disciplinas').then((r) => r.json()),
      ]);
      setTurmas(tR.items || []);
      setDisciplinas(dR.items || []);
    })();
  }, []);

  useEffect(() => {
    if (!turmaId || !discId || !bimestre) { setItems([]); return; }
    setLoading(true);
    fetch(`/api/notas?turma_id=${turmaId}&disciplina_id=${discId}&bimestre=${bimestre}`)
      .then((r) => r.json())
      .then((d) => { setItems(d.items || []); setDirty({}); })
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
      const r = await fetch('/api/notas/batch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Falha ao salvar');
      toast.success(`${data.gravadas || 0} nota(s) salva(s). Alertas foram recalculados.`);
      setDirty({});
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <Header title="Desempenho — Lançamento de Notas"
        subtitle="Selecione turma, disciplina e bimestre para registrar as notas." showSearch={false} />

      <div className="px-8 pb-8 space-y-6">
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
    </div>
  );
}
