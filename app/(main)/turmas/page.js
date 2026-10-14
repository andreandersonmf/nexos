'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Header } from '@/components/nexos/header';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { Users2, Loader2, ArrowUpRight, Plus, GraduationCap } from 'lucide-react';
import { useAuth } from '@/components/nexos/auth-provider';
import { api } from '@/lib/client/api';

export default function TurmasPage() {
  const { user } = useAuth();
  const podeGerenciar = user?.perfil === 'ADMIN' || user?.perfil === 'COORDENADOR';
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const [dialogAberto, setDialogAberto] = useState(false);
  const [form, setForm] = useState({ nome: '', turno: 'Manhã', ano_letivo: '' });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const carregar = async () => {
    setLoading(true);
    try {
      const d = await api('/turmas');
      setItems(d.items || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { carregar(); }, []);

  const salvar = async () => {
    setSalvando(true);
    setErro('');
    try {
      await api('/turmas', {
        method: 'POST',
        body: { nome: form.nome, turno: form.turno, ano_letivo: Number(form.ano_letivo) || undefined },
      });
      setDialogAberto(false);
      carregar();
    } catch (e) {
      setErro(e.message || 'Não foi possível criar a turma.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div>
      <Header title="Turmas" subtitle="Visão geral das turmas ativas na escola." showSearch={false} />
      <div className="px-8 pb-8">
        {podeGerenciar && (
          <div className="flex justify-end mb-4">
            <Button className="bg-indigo-600 hover:bg-indigo-700"
              onClick={() => { setForm({ nome: '', turno: 'Manhã', ano_letivo: '' }); setErro(''); setDialogAberto(true); }}>
              <Plus className="w-4 h-4 mr-1" /> Nova turma
            </Button>
          </div>
        )}
        {loading ? (
          <div className="flex items-center gap-2 text-slate-500 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando turmas…
          </div>
        ) : items.length === 0 ? (
          <Card className="p-10 text-center text-sm text-slate-500">Nenhuma turma cadastrada.</Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((t) => (
              <Link key={t.id} href={`/turmas/${t.id}`}>
                <Card className="p-5 border-slate-200 shadow-none hover:shadow-sm hover:border-indigo-300 transition-all cursor-pointer group">
                  <div className="flex items-start justify-between">
                    <div className="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                      <Users2 className="w-5 h-5" />
                    </div>
                    <ArrowUpRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-500 transition-colors" />
                  </div>
                  <div className="mt-4">
                    <div className="text-lg font-semibold text-slate-900">{t.nome}</div>
                    <div className="text-xs text-slate-500 mt-0.5">Turno {t.turno} · Ano letivo {t.ano_letivo}</div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
                    <div className="text-xs text-slate-500">Alunos matriculados</div>
                    <div className="text-sm font-semibold text-slate-900">{t.totalAlunos}</div>
                  </div>
                  {(t.professores || []).length > 0 && (
                    <div className="mt-3 flex items-center gap-2 flex-wrap">
                      <GraduationCap className="w-3.5 h-3.5 text-slate-400" />
                      {t.professores.map((p) => (
                        <span key={p} className="text-[11px] px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-100">{p}</span>
                      ))}
                    </div>
                  )}
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nova turma</DialogTitle>
            <DialogDescription>Crie uma turma e depois vincule professores e alunos.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="turma-nome">Nome da turma</Label>
              <Input id="turma-nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Ex.: 6º Ano A" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Turno</Label>
                <Select value={form.turno} onValueChange={(v) => setForm({ ...form, turno: v })}>
                  <SelectTrigger className="w-full bg-white"><SelectValue placeholder="Turno" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Manhã">Manhã</SelectItem>
                    <SelectItem value="Tarde">Tarde</SelectItem>
                    <SelectItem value="Noite">Noite</SelectItem>
                    <SelectItem value="Integral">Integral</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="turma-ano">Ano letivo</Label>
                <Input id="turma-ano" type="number" value={form.ano_letivo} onChange={(e) => setForm({ ...form, ano_letivo: e.target.value })} placeholder="Ex.: 2026" />
              </div>
            </div>
            {erro && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{erro}</div>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogAberto(false)} disabled={salvando}>Cancelar</Button>
            <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={salvar} disabled={salvando || !form.nome.trim()}>
              {salvando && <Loader2 className="w-4 h-4 animate-spin mr-1" />} Criar turma
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
