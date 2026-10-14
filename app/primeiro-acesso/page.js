'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Logo } from '@/components/nexos/logo';
import { KeyRound, Loader2, LogOut } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/client/api';
import { useAuth } from '@/components/nexos/auth-provider';

export default function PrimeiroAcessoPage() {
  const router = useRouter();
  const { user, logout, refresh } = useAuth();
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (senha !== confirmacao) {
      toast.error('As senhas não coincidem.');
      return;
    }
    if (senha.length < 8) {
      toast.error('A senha deve ter pelo menos 8 caracteres.');
      return;
    }
    setLoading(true);
    try {
      await api('/perfil/senha', { method: 'POST', body: { nova_senha: senha } });
      await refresh();
      toast.success('Senha alterada com sucesso!');
      router.replace('/dashboard');
    } catch (err) {
      toast.error(err.message || 'Falha ao alterar a senha.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      <Card className="w-full max-w-md p-8 shadow-xl border-slate-200">
        <div className="flex flex-col items-center mb-6">
          <Logo size="lg" />
        </div>
        <div className="flex items-start gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0">
            <KeyRound className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-slate-900">Primeiro acesso</h1>
            <p className="text-sm text-slate-500 mt-1">
              Olá, {user?.nome?.split(' ')[0] || 'você'}! Você está usando uma senha temporária.
              Defina uma nova senha para continuar.
            </p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="senha" className="text-sm font-medium text-slate-700">Nova senha</Label>
            <Input id="senha" type="password" required value={senha} onChange={(e) => setSenha(e.target.value)}
              placeholder="Mínimo de 8 caracteres" autoComplete="new-password" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmacao" className="text-sm font-medium text-slate-700">Confirmar nova senha</Label>
            <Input id="confirmacao" type="password" required value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)}
              placeholder="Repita a nova senha" autoComplete="new-password" />
          </div>
          <Button type="submit" disabled={loading}
            className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 text-white font-medium">
            {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Salvando…</> : 'Definir nova senha'}
          </Button>
        </form>

        <button onClick={logout}
          className="mt-4 w-full flex items-center justify-center gap-2 text-sm text-slate-500 hover:text-red-600 transition-colors">
          <LogOut className="w-4 h-4" /> Sair
        </button>
      </Card>
    </div>
  );
}
