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

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('ana@nexos.com');
  const [senha, setSenha] = useState('nexos123');
  const [showSenha, setShowSenha] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem('nexos_user')) router.replace('/dashboard');
    } catch {}
  }, [router]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, senha }),
      });
      const data = await r.json();
      if (!r.ok) {
        toast.error(data.error || 'Falha ao entrar.');
        return;
      }
      localStorage.setItem('nexos_user', JSON.stringify(data.user));
      toast.success(`Bem-vindo(a), ${data.user.nome.split(' ')[0]}!`);
      router.replace('/dashboard');
    } catch (err) {
      toast.error('Erro de conexão.');
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
                className="pl-9 h-11" placeholder="seu@email.com"
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
                className="pl-9 pr-10 h-11" placeholder="••••••••"
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
            <a href="#" className="text-xs text-indigo-600 hover:underline">Esqueceu sua senha?</a>
          </div>
        </form>

        <div className="mt-6 pt-6 border-t border-slate-100">
          <p className="text-xs text-center text-slate-400">
            Não tem uma conta? Entre em contato com a escola.
          </p>
          <div className="mt-3 rounded-lg bg-slate-50 border border-slate-100 p-3 text-xs text-slate-500">
            <div className="font-medium text-slate-600 mb-1">Demo:</div>
            <div>ana@nexos.com / nexos123 (Coordenadora)</div>
          </div>
        </div>
      </Card>
    </div>
  );
}
