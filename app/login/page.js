'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Logo } from '@/components/nexos/logo';
import { Mail, Lock, Eye, EyeOff, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/components/nexos/auth-provider';

export default function LoginPage() {
  const router = useRouter();
  const { user, login } = useAuth();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [showSenha, setShowSenha] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      router.replace(user.senha_temporaria ? '/primeiro-acesso' : '/dashboard');
    }
  }, [user, router]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const u = await login(email, senha);
      toast.success(`Bem-vindo(a), ${u.nome.split(' ')[0]}!`);
      router.replace(u.senha_temporaria ? '/primeiro-acesso' : '/dashboard');
    } catch (err) {
      toast.error(err.message || 'Falha ao entrar.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-indigo-50 via-white to-purple-50 relative overflow-hidden">
      <div className="absolute -top-24 -left-24 w-72 h-72 bg-indigo-200/40 rounded-full blur-3xl" />
      <div className="absolute -bottom-24 -right-24 w-72 h-72 bg-purple-200/40 rounded-full blur-3xl" />

      <Card className="relative w-full max-w-md p-8 shadow-xl border-slate-200">
        <div className="flex flex-col items-center mb-8">
          <Logo size="lg" />
          <p className="text-slate-500 text-sm mt-4 text-center">Juntos pelo futuro dos seus alunos.</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm font-medium text-slate-700">E-mail</Label>
            <div className="relative">
              <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                className="pl-9 h-11" placeholder="seu@email.com" autoComplete="email"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="senha" className="text-sm font-medium text-slate-700">Senha</Label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                id="senha" type={showSenha ? 'text' : 'password'} required value={senha}
                onChange={(e) => setSenha(e.target.value)}
                className="pl-9 pr-10 h-11" placeholder="••••••••" autoComplete="current-password"
              />
              <button type="button" onClick={() => setShowSenha(!showSenha)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {showSenha ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <Button type="submit" disabled={loading}
            className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 text-white font-medium">
            {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Entrando…</> : 'Entrar'}
          </Button>
          <div className="text-center">
            <span className="text-xs text-slate-400">Esqueceu sua senha? Procure a secretaria da escola.</span>
          </div>
        </form>

        <div className="mt-6 pt-6 border-t border-slate-100">
          <p className="text-xs text-center text-slate-400">
            Não tem uma conta? As contas de alunos são criadas pela administração da escola.
          </p>
        </div>
      </Card>
    </div>
  );
}
