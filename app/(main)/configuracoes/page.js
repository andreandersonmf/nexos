'use client';

import { useCallback, useEffect, useState } from 'react';
import { Header } from '@/components/nexos/header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Settings, UserRound, Building2, GraduationCap, Users, Loader2, Plus, KeyRound, KeySquare, Pencil, Trash2,
} from 'lucide-react';
import { useAuth } from '@/components/nexos/auth-provider';
import { api } from '@/lib/client/api';

const CHAVES_ACADEMICAS = [
  { chave: 'ano_letivo', label: 'Ano letivo', tipo: 'numero' },
  { chave: 'bimestres_ativos', label: 'Bimestres ativos', tipo: 'numero' },
  { chave: 'limite_frequencia_alerta_media', label: 'Limite de frequência — alerta médio (%)', tipo: 'numero' },
  { chave: 'limite_frequencia_alerta_alta', label: 'Limite de frequência — alerta alto (%)', tipo: 'numero' },
  { chave: 'media_minima_aprovacao', label: 'Média mínima de aprovação', tipo: 'numero' },
];
const CHAVES_INSTITUCIONAIS = [
  { chave: 'nome_instituicao', label: 'Nome da instituição', tipo: 'texto' },
  { chave: 'email_contato', label: 'E-mail de contato', tipo: 'texto' },
];

function valorChave(grupos, chave) {
  const alvo = [...(grupos.instituicao || []), ...(grupos.academico || [])].find((c) => c.chave === chave);
  return alvo ? String(alvo.valor) : '';
}

export default function ConfiguracoesPage() {
  const { user, refresh } = useAuth();
  const [grupos, setGrupos] = useState({ instituicao: [], academico: [] });
  const [carregando, setCarregando] = useState(true);

  // perfil
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [salvandoPerfil, setSalvandoPerfil] = useState(false);

  // senha
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [salvandoSenha, setSalvandoSenha] = useState(false);

  // configs
  const [valores, setValores] = useState({});
  const [salvandoConfig, setSalvandoConfig] = useState(false);

  // usuários
  const [usuarios, setUsuarios] = useState([]);
  const [turmas, setTurmas] = useState([]);
  const [alunosDisponiveis, setAlunosDisponiveis] = useState([]);
  const [dialogUsuario, setDialogUsuario] = useState(false);
  const [usuarioEditando, setUsuarioEditando] = useState(null);
  const [formUsuario, setFormUsuario] = useState({ nome: '', email: '', perfil: 'PROFESSOR', cargo: '', matricula_aluno: '' });
  const [salvandoUsuario, setSalvandoUsuario] = useState(false);
  const [credencial, setCredencial] = useState(null); // {email, senha} exibida uma única vez
  const [erro, setErro] = useState('');
  const [msg, setMsg] = useState('');

  const podeEditarInst = user?.perfil === 'ADMIN';
  const podeEditarAcad = user?.perfil === 'ADMIN' || user?.perfil === 'COORDENADOR';
  const podeGerenciarUsuarios = user?.perfil === 'ADMIN' || user?.perfil === 'COORDENADOR';
  const ehAluno = user?.perfil === 'ALUNO';

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const d = await api('/configuracoes');
      setGrupos(d.grupos || { instituicao: [], academico: [] });
      if (d.perfil) {
        setNome(d.perfil.nome || '');
        setEmail(d.perfil.email || '');
      }
      if (podeGerenciarUsuarios) {
        const u = await api('/usuarios');
        setUsuarios(u.items || []);
      }
      if (!['ALUNO', 'RESPONSAVEL'].includes(user?.perfil)) {
        try {
          const t = await api('/turmas');
          setTurmas(t.items || []);
        } catch { setTurmas([]); }
      }
      if (user?.perfil === 'ADMIN') {
        try { const a = await api('/alunos'); setAlunosDisponiveis(a.items || []); }
        catch { setAlunosDisponiveis([]); }
      }
    } finally {
      setCarregando(false);
    }
  }, [podeGerenciarUsuarios, user]);

  useEffect(() => { carregar(); }, [carregar]);

  const salvarPerfil = async () => {
    setSalvandoPerfil(true);
    setMsg('');
    setErro('');
    try {
      await api('/perfil', { method: 'PUT', body: { nome, email } });
      await refresh();
      setMsg('Perfil atualizado.');
    } catch (e) {
      setErro(e.message || 'Não foi possível atualizar o perfil.');
    } finally {
      setSalvandoPerfil(false);
    }
  };

  const salvarSenha = async () => {
    if (novaSenha !== confirmarSenha) { setErro('A confirmação não confere com a nova senha.'); return; }
    setSalvandoSenha(true);
    setMsg('');
    setErro('');
    try {
      await api('/perfil/senha', { method: 'POST', body: { senha_atual: senhaAtual, nova_senha: novaSenha } });
      setSenhaAtual(''); setNovaSenha(''); setConfirmarSenha('');
      await refresh();
      setMsg('Senha alterada com sucesso.');
    } catch (e) {
      setErro(e.message || 'Não foi possível alterar a senha.');
    } finally {
      setSalvandoSenha(false);
    }
  };

  const salvarConfiguracao = async (chave) => {
    setSalvandoConfig(true);
    setErro('');
    setMsg('');
    try {
      await api('/configuracoes', { method: 'PATCH', body: { chave, valor: String(valores[chave] ?? '') } });
      setMsg('Configuração salva.');
      carregar();
    } catch (e) {
      setErro(e.message || 'Não foi possível salvar.');
    } finally {
      setSalvandoConfig(false);
    }
  };

  const abrirNovoUsuario = () => {
    setUsuarioEditando(null);
    setFormUsuario({ nome: '', email: '', perfil: 'PROFESSOR', cargo: '', matricula_aluno: '' });
    setCredencial(null);
    setErro('');
    setDialogUsuario(true);
  };

  const abrirEditarUsuario = (u) => {
    setUsuarioEditando(u);
    setFormUsuario({
      nome: u.nome || '',
      email: u.email || '',
      perfil: u.perfil || 'PROFESSOR',
      cargo: u.cargo || '',
      matricula_aluno: u.matricula_aluno || '',
    });
    setCredencial(null);
    setErro('');
    setDialogUsuario(true);
  };

  const salvarUsuario = async () => {
    setSalvandoUsuario(true);
    setErro('');
    setMsg('');
    try {
      if (usuarioEditando) {
        const body = {
          nome: formUsuario.nome,
          email: formUsuario.email,
          cargo: formUsuario.cargo || null,
          ...( ['ALUNO', 'RESPONSAVEL'].includes(usuarioEditando.perfil)
            ? { matricula_aluno: formUsuario.matricula_aluno } : {}),
        };
        await api(`/usuarios/${usuarioEditando.id}`, { method: 'PATCH', body });
        setDialogUsuario(false);
        setMsg('Conta atualizada com sucesso.');
        await carregar();
      } else {
        const body = {
          nome: formUsuario.nome,
          email: formUsuario.email,
          perfil: formUsuario.perfil,
          cargo: formUsuario.cargo || null,
          matricula_aluno: ['ALUNO', 'RESPONSAVEL'].includes(formUsuario.perfil) ? formUsuario.matricula_aluno : undefined,
        };
        const d = await api('/usuarios', { method: 'POST', body });
        setCredencial({ email: formUsuario.email, senha: d.credencial_temporaria, aviso: d.aviso });
        await carregar();
      }
    } catch (e) {
      setErro(e.message || (usuarioEditando ? 'Não foi possível atualizar a conta.' : 'Não foi possível criar a conta.'));
    } finally {
      setSalvandoUsuario(false);
    }
  };

  const alternarStatus = async (u) => {
    try {
      await api(`/usuarios/${u.id}`, { method: 'PATCH', body: { status: u.status === 'ativo' ? 'inativo' : 'ativo' } });
      carregar();
    } catch (e) {
      alert(e.message || 'Não foi possível alterar o status.');
    }
  };

  const redefinirSenha = async (u) => {
    if (!confirm(`Gerar nova senha temporária para ${u.nome}? As sessões ativas serão encerradas.`)) return;
    try {
      const d = await api(`/usuarios/${u.id}/redefinir-senha`, { method: 'POST' });
      setUsuarioEditando(null);
      setCredencial({ email: u.email, senha: d.credencial_temporaria, aviso: 'Senha temporária gerada. Entregue por canal seguro; o usuário deverá alterá-la no primeiro acesso.' });
      setErro('');
      setDialogUsuario(true);
    } catch (e) {
      alert(e.message || 'Não foi possível redefinir a senha.');
    }
  };

  const excluirUsuario = async (u) => {
    if (!confirm(`Excluir a conta de ${u.nome} (${u.email})? Esta ação não apaga os dados escolares do aluno vinculado.`)) return;
    try {
      await api(`/usuarios/${u.id}`, { method: 'DELETE' });
      setMsg(`A conta de ${u.nome} foi excluída.`);
      await carregar();
    } catch (e) {
      alert(e.message || 'Não foi possível excluir a conta.');
    }
  };

  if (carregando) {
    return (
      <div>
        <Header title="Configurações" subtitle=" " showSearch={false} />
        <div className="px-8 flex items-center gap-2 text-slate-500 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando configurações…
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header title="Configurações" subtitle="Perfil, preferências institucionais e contas de acesso." showSearch={false} />
      <div className="px-8 pb-8 space-y-6">
        {msg && <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">{msg}</div>}
        {erro && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{erro}</div>}

        {/* MEU PERFIL */}
        <Card className="border-slate-200 shadow-none">
          <div className="p-5 border-b border-slate-100 flex items-center gap-2">
            <UserRound className="w-4 h-4 text-indigo-500" />
            <h3 className="text-base font-semibold text-slate-900">Meu perfil</h3>
          </div>
          <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
            <div className="grid gap-2">
              <Label htmlFor="perfil-nome">Nome</Label>
              <Input id="perfil-nome" value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="perfil-email">E-mail</Label>
              <Input id="perfil-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="md:col-span-2 text-xs text-slate-400">
              Perfil: {user?.perfil}{ehAluno && user?.matricula_aluno ? ` · Matrícula ${user.matricula_aluno}` : ''} — o perfil e a matrícula não podem ser alterados pelo próprio usuário.
            </div>
            <div>
              <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={salvarPerfil} disabled={salvandoPerfil}>
                {salvandoPerfil && <Loader2 className="w-4 h-4 animate-spin mr-1" />} Salvar perfil
              </Button>
            </div>
          </div>
        </Card>

        {/* SENHA */}
        <Card className="border-slate-200 shadow-none">
          <div className="p-5 border-b border-slate-100 flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-indigo-500" />
            <h3 className="text-base font-semibold text-slate-900">Alterar senha</h3>
          </div>
          <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-4 max-w-3xl">
            {!user?.senha_temporaria && (
              <div className="grid gap-2">
                <Label htmlFor="senha-atual">Senha atual</Label>
                <Input id="senha-atual" type="password" value={senhaAtual} onChange={(e) => setSenhaAtual(e.target.value)} />
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="senha-nova">Nova senha</Label>
              <Input id="senha-nova" type="password" value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} placeholder="Mínimo de 8 caracteres" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="senha-confirmar">Confirmar nova senha</Label>
              <Input id="senha-confirmar" type="password" value={confirmarSenha} onChange={(e) => setConfirmarSenha(e.target.value)} />
            </div>
            <div>
              <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={salvarSenha} disabled={salvandoSenha || novaSenha.length < 8}>
                {salvandoSenha && <Loader2 className="w-4 h-4 animate-spin mr-1" />} Alterar senha
              </Button>
            </div>
          </div>
        </Card>

        {/* INSTITUIÇÃO */}
        {user?.perfil !== 'ALUNO' && grupos.instituicao.length > 0 && (
          <Card className="border-slate-200 shadow-none">
            <div className="p-5 border-b border-slate-100 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-indigo-500" />
              <h3 className="text-base font-semibold text-slate-900">Instituição</h3>
              {!podeEditarInst && <Badge className="bg-slate-100 text-slate-600 border-slate-200">Somente leitura</Badge>}
            </div>
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl">
              {CHAVES_INSTITUCIONAIS.map((c) => (
                <div key={c.chave} className="grid gap-2">
                  <Label htmlFor={`cfg-${c.chave}`}>{c.label}</Label>
                  <Input id={`cfg-${c.chave}`}
                    value={valores[c.chave] ?? valorChave(grupos, c.chave)}
                    onChange={(e) => setValores({ ...valores, [c.chave]: e.target.value })}
                    disabled={!podeEditarInst} />
                  {podeEditarInst && (
                    <Button variant="outline" size="sm" className="justify-self-start"
                      onClick={() => salvarConfiguracao(c.chave)} disabled={salvandoConfig}>
                      Salvar
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* ACADÊMICO */}
        {podeEditarAcad && (
          <Card className="border-slate-200 shadow-none">
            <div className="p-5 border-b border-slate-100 flex items-center gap-2">
              <GraduationCap className="w-4 h-4 text-indigo-500" />
              <h3 className="text-base font-semibold text-slate-900">Parâmetros acadêmicos</h3>
            </div>
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl">
              {CHAVES_ACADEMICAS.map((c) => (
                <div key={c.chave} className="grid gap-2">
                  <Label htmlFor={`acad-${c.chave}`}>{c.label}</Label>
                  <Input id={`acad-${c.chave}`} type={c.tipo === 'numero' ? 'number' : 'text'}
                    value={valores[c.chave] ?? valorChave(grupos, c.chave)}
                    onChange={(e) => setValores({ ...valores, [c.chave]: e.target.value })} />
                  <Button variant="outline" size="sm" className="justify-self-start"
                    onClick={() => salvarConfiguracao(c.chave)} disabled={salvandoConfig}>
                    Salvar
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* USUÁRIOS */}
        {podeGerenciarUsuarios && (
          <Card className="border-slate-200 shadow-none">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-500" />
                <h3 className="text-base font-semibold text-slate-900">Contas de acesso</h3>
              </div>
              <Button className="bg-indigo-600 hover:bg-indigo-700" size="sm" onClick={abrirNovoUsuario}>
                <Plus className="w-4 h-4 mr-1" /> Nova conta
              </Button>
            </div>
            <div className="p-2 text-xs text-slate-400 px-5 pt-3">
              {user?.perfil === 'ADMIN'
                ? 'Como administrador, você pode criar contas de todos os perfis. Contas de aluno exigem matrícula já cadastrada.'
                : 'Como coordenador, você pode criar e gerenciar apenas contas de professores. Contas de alunos são criadas exclusivamente pela administração.'}
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 hover:bg-slate-50">
                    <TableHead>Nome</TableHead>
                    <TableHead>E-mail</TableHead>
                    <TableHead>Perfil</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usuarios.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.nome}</TableCell>
                      <TableCell className="text-sm text-slate-600">{u.email}</TableCell>
                      <TableCell>
                        <Badge className={u.perfil === 'ALUNO' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : u.perfil === 'ADMIN' ? 'bg-red-100 text-red-700 border-red-200' : 'bg-indigo-100 text-indigo-700 border-indigo-200'}>
                          {u.perfil}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <button onClick={() => alternarStatus(u)} title="Clique para alternar">
                          <Badge className={u.status === 'ativo' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'}>
                            {u.status === 'ativo' ? 'Ativo' : 'Inativo'}
                          </Badge>
                        </button>
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <Button variant="ghost" size="sm" onClick={() => abrirEditarUsuario(u)} title="Editar usuário" aria-label={`Editar ${u.nome}`}>
                          <Pencil className="w-4 h-4 text-slate-500" />
                        </Button>
                        {user?.perfil === 'ADMIN' && (
                          <>
                            <Button variant="ghost" size="sm" onClick={() => redefinirSenha(u)} title="Gerar nova senha temporária" aria-label={`Redefinir senha de ${u.nome}`}>
                              <KeySquare className="w-4 h-4 text-indigo-600" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => excluirUsuario(u)} title="Excluir usuário" aria-label={`Excluir ${u.nome}`}>
                              <Trash2 className="w-4 h-4 text-red-500" />
                            </Button>
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        )}
      </div>

      <Dialog open={dialogUsuario} onOpenChange={setDialogUsuario}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{credencial ? 'Credencial temporária' : usuarioEditando ? 'Editar conta de acesso' : 'Nova conta de acesso'}</DialogTitle>
            <DialogDescription>
              {credencial ? 'A senha abaixo é exibida apenas agora. Copie e entregue por um canal seguro.' : usuarioEditando ? 'Atualize os dados da conta. O perfil não pode ser alterado por esta tela.' : user?.perfil === 'ADMIN' ? 'Contas de aluno exigem matrícula já cadastrada no sistema. Uma senha temporária será gerada; o usuário deverá alterá-la no primeiro acesso.' : 'Você pode criar contas de professores. Uma senha temporária será gerada; o professor deverá alterá-la no primeiro acesso.'}
            </DialogDescription>
          </DialogHeader>
          {credencial ? (
            <div className="space-y-3 py-2">
              <div className="text-sm text-slate-700 bg-amber-50 border border-amber-200 rounded-md p-4">
                <div className="font-semibold mb-1">Credencial temporária — exibida apenas agora</div>
                <div>E-mail: <span className="font-mono">{credencial.email}</span></div>
                <div>Senha temporária: <span className="font-mono font-semibold">{credencial.senha}</span></div>
              </div>
              <div className="text-xs text-slate-500">{credencial.aviso}</div>
              <div className="text-xs text-slate-400">Copie agora — esta senha não será exibida novamente.</div>
            </div>
          ) : (
            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <Label htmlFor="usr-nome">Nome</Label>
                <Input id="usr-nome" value={formUsuario.nome} onChange={(e) => setFormUsuario({ ...formUsuario, nome: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="usr-email">E-mail</Label>
                <Input id="usr-email" type="email" value={formUsuario.email} onChange={(e) => setFormUsuario({ ...formUsuario, email: e.target.value })} />
              </div>
              {!usuarioEditando && <div className="grid gap-2">
                <Label>Perfil</Label>
                <Select value={formUsuario.perfil} onValueChange={(v) => setFormUsuario({ ...formUsuario, perfil: v })}>
                  <SelectTrigger className="w-full bg-white"><SelectValue placeholder="Perfil" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PROFESSOR">Professor</SelectItem>
                    {user?.perfil === 'ADMIN' && <SelectItem value="COORDENADOR">Coordenador</SelectItem>}
                    {user?.perfil === 'ADMIN' && <SelectItem value="ALUNO">Aluno</SelectItem>}
                    {user?.perfil === 'ADMIN' && <SelectItem value="RESPONSAVEL">Responsável</SelectItem>}
                  </SelectContent>
                </Select>
              </div>}
              {!['ALUNO', 'RESPONSAVEL'].includes(formUsuario.perfil) && (
                <div className="grid gap-2">
                  <Label htmlFor="usr-cargo">Cargo (opcional)</Label>
                  <Input id="usr-cargo" value={formUsuario.cargo} onChange={(e) => setFormUsuario({ ...formUsuario, cargo: e.target.value })} placeholder="Ex.: Professor de Matemática" />
                </div>
              )}
              {['ALUNO', 'RESPONSAVEL'].includes(formUsuario.perfil) && (
                <div className="grid gap-2">
                  <Label htmlFor="usr-matricula">Aluno vinculado</Label>
                  <Select value={formUsuario.matricula_aluno} onValueChange={(v) => setFormUsuario({ ...formUsuario, matricula_aluno: v })}>
                    <SelectTrigger className="w-full bg-white"><SelectValue placeholder="Selecione um aluno cadastrado" /></SelectTrigger>
                    <SelectContent>
                      {alunosDisponiveis.map((a) => <SelectItem key={a.matricula} value={a.matricula}>{a.nome} · {a.matricula}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {formUsuario.perfil === 'RESPONSAVEL' && <p className="text-xs text-slate-500">O responsável poderá consultar somente o desenvolvimento deste aluno.</p>}
                </div>
              )}
              {erro && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{erro}</div>}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogUsuario(false)} disabled={salvandoUsuario}>Fechar</Button>
            {!credencial && (
              <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={salvarUsuario}
                disabled={salvandoUsuario || !formUsuario.nome.trim() || !formUsuario.email.trim() ||
                  (['ALUNO', 'RESPONSAVEL'].includes(formUsuario.perfil) && !formUsuario.matricula_aluno.trim())}>
                {salvandoUsuario && <Loader2 className="w-4 h-4 animate-spin mr-1" />} {usuarioEditando ? 'Salvar alterações' : 'Criar conta'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
