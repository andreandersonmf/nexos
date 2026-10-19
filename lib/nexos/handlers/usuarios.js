import { ApiError, requirePerfil, sanitizarUsuario, encerrarTodasSessoesDoUsuario } from '@/lib/nexos/auth';
import { hashSenha, gerarSenhaTemporaria, registrarAuditoria } from '@/lib/nexos/security';
import { proximoId } from '@/lib/nexos/metrics';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Listagem de contas.
 * ADMIN: todas. COORDENADOR: PROFESSOR e COORDENADOR (sem contas de alunos).
 */
export async function listarUsuarios(db, usuario) {
  requirePerfil(usuario, ['ADMIN', 'COORDENADOR']);
  const filtro = usuario.perfil === 'ADMIN'
    ? {}
    : { perfil: { $in: ['PROFESSOR', 'COORDENADOR'] } };
  const items = await db.collection('usuarios').find(filtro).sort({ nome: 1 }).toArray();
  return { items: items.map(sanitizarUsuario) };
}

/**
 * Criação de contas.
 * ADMIN: qualquer perfil. COORDENADOR: apenas PROFESSOR.
 * Conta de ALUNO exige matrícula existente, não vinculada a outra conta.
 */
export async function criarUsuario(db, usuario, body) {
  requirePerfil(usuario, ['ADMIN', 'COORDENADOR']);
  const { nome, email, perfil, cargo, matricula_aluno, turmas, disciplinas } = body || {};

  if (typeof nome !== 'string' || !nome.trim()) throw new ApiError(400, 'Nome é obrigatório.');
  if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) throw new ApiError(400, 'E-mail inválido.');
  if (!['ALUNO', 'RESPONSAVEL', 'PROFESSOR', 'COORDENADOR'].includes(perfil)) {
    throw new ApiError(400, 'Perfil inválido.');
  }
  if (usuario.perfil === 'COORDENADOR' && perfil !== 'PROFESSOR') {
    throw new ApiError(403, 'O coordenador pode criar apenas contas de professores.');
  }

  const emailNormalizado = email.toLowerCase().trim();
  let alunoDoVinculo = null;
  const [existente, emailUsado] = await Promise.all([
    perfil === 'ALUNO'
      ? db.collection('usuarios').findOne({ perfil: 'ALUNO', matricula_aluno })
      : Promise.resolve(null),
    db.collection('usuarios').findOne({ email: emailNormalizado }),
  ]);

  if (['ALUNO', 'RESPONSAVEL'].includes(perfil)) {
    if (typeof matricula_aluno !== 'string' || !matricula_aluno.trim()) {
      throw new ApiError(400, 'Matrícula do aluno é obrigatória.');
    }
    alunoDoVinculo = await db.collection('alunos').findOne({ matricula: matricula_aluno.trim() });
    if (!alunoDoVinculo) throw new ApiError(404, 'Matrícula não encontrada no cadastro de alunos.');
    if (existente) throw new ApiError(409, 'Esta matrícula já está vinculada a uma conta de aluno.');
  }
  if (emailUsado) throw new ApiError(409, 'Este e-mail já está associado a outra conta.');

  const senhaTemporaria = gerarSenhaTemporaria();
  const { salt, hash } = hashSenha(senhaTemporaria);

  const novo = {
    id: await proximoId(db, 'usuarios'),
    nome: nome.trim(),
    email: emailNormalizado,
    perfil,
    cargo: typeof cargo === 'string' && cargo.trim() ? cargo.trim() : null,
    senha_hash: hash,
    salt,
    senha_temporaria: true,
    status: 'ativo',
    criado_em: new Date().toISOString(),
    criado_por: usuario.id,
  };
  if (['ALUNO', 'RESPONSAVEL'].includes(perfil)) {
    novo.matricula_aluno = matricula_aluno.trim();
    novo.turma_id = alunoDoVinculo.turma_id;
  }
  if (perfil === 'PROFESSOR') {
    novo.turmas = Array.isArray(turmas) ? turmas.map(Number).filter((t) => Number.isFinite(t)) : [];
    novo.disciplinas = Array.isArray(disciplinas) ? disciplinas.map(Number).filter((d) => Number.isFinite(d)) : [];
    // valida referências
    if (novo.turmas.length) {
      const existentes = await db.collection('turmas').find({ id: { $in: novo.turmas } }).toArray();
      if (existentes.length !== novo.turmas.length) throw new ApiError(400, 'Uma ou mais turmas informadas não existem.');
    }
    if (novo.disciplinas.length) {
      const existentes = await db.collection('disciplinas').find({ id: { $in: novo.disciplinas } }).toArray();
      if (existentes.length !== novo.disciplinas.length) throw new ApiError(400, 'Uma ou mais disciplinas informadas não existem.');
    }
  }
  if (perfil === 'COORDENADOR') novo.turmas = [];

  await db.collection('usuarios').insertOne(novo);
  await registrarAuditoria(db, usuario, 'criar_usuario', 'usuarios', { perfil, alvo: novo.email, matricula: novo.matricula_aluno || null });

  // Credencial temporária: entregue pelo administrador por canal autorizado (não armazenada em lugar nenhum)
  return {
    usuario: sanitizarUsuario(novo),
    credencial_temporaria: senhaTemporaria,
    aviso: perfil === 'ALUNO'
      ? 'Conta criada. Entregue a senha temporária ao aluno por canal seguro; no primeiro acesso ele deverá alterá-la.'
      : perfil === 'RESPONSAVEL'
        ? 'Conta de responsável criada e vinculada ao aluno. Entregue a senha temporária por canal seguro; no primeiro acesso deverá alterá-la.'
      : 'Conta criada. Entregue a senha temporária por canal seguro; no primeiro acesso deverá ser alterada.',
  };
}

/**
 * Atualização de conta.
 * ADMIN: qualquer conta. COORDENADOR: apenas PROFESSOR (status e vínculos acadêmicos).
 */
export async function atualizarUsuario(db, usuario, id, body) {
  requirePerfil(usuario, ['ADMIN', 'COORDENADOR']);
  const alvo = await db.collection('usuarios').findOne({ id: Number(id) });
  if (!alvo) throw new ApiError(404, 'Usuário não encontrado.');

  if (usuario.perfil === 'COORDENADOR' && alvo.perfil !== 'PROFESSOR') {
    throw new ApiError(403, 'O coordenador pode gerenciar apenas contas de professores.');
  }

  const set = {};
  const { nome, cargo, status, turmas, disciplinas } = body || {};

  if (nome !== undefined) {
    if (typeof nome !== 'string' || !nome.trim()) throw new ApiError(400, 'Nome inválido.');
    set.nome = nome.trim();
  }
  if (cargo !== undefined) set.cargo = typeof cargo === 'string' ? cargo.trim() : null;
  if (status !== undefined) {
    if (!['ativo', 'inativo'].includes(status)) throw new ApiError(400, 'Status inválido.');
    set.status = status;
    if (status === 'inativo') await encerrarTodasSessoesDoUsuario(db, alvo.id);
  }
  if (turmas !== undefined && alvo.perfil === 'PROFESSOR') {
    const lista = Array.isArray(turmas) ? turmas.map(Number).filter((t) => Number.isFinite(t)) : [];
    if (lista.length) {
      const existentes = await db.collection('turmas').find({ id: { $in: lista } }).toArray();
      if (existentes.length !== lista.length) throw new ApiError(400, 'Uma ou mais turmas informadas não existem.');
    }
    set.turmas = lista;
  }
  if (disciplinas !== undefined && alvo.perfil === 'PROFESSOR') {
    const lista = Array.isArray(disciplinas) ? disciplinas.map(Number).filter((d) => Number.isFinite(d)) : [];
    set.disciplinas = lista;
  }
  if (alvo.perfil !== 'PROFESSOR' && (turmas !== undefined || disciplinas !== undefined)) {
    throw new ApiError(400, 'Vínculos de turma aplicam-se apenas a professores.');
  }

  if (Object.keys(set).length) {
    await db.collection('usuarios').updateOne({ id: alvo.id }, { $set: set });
  }
  await registrarAuditoria(db, usuario, 'atualizar_usuario', 'usuarios', { alvo: alvo.email, campos: Object.keys(set) });
  const atualizado = await db.collection('usuarios').findOne({ id: alvo.id });
  return { usuario: sanitizarUsuario(atualizado) };
}

/**
 * Redefinição de senha de terceiros — exclusiva do ADMIN.
 * Gera nova senha temporária (troca obrigatória no próximo acesso) e encerra as sessões.
 */
export async function redefinirSenha(db, usuario, id) {
  requirePerfil(usuario, ['ADMIN']);
  const alvo = await db.collection('usuarios').findOne({ id: Number(id) });
  if (!alvo) throw new ApiError(404, 'Usuário não encontrado.');

  const senhaTemporaria = gerarSenhaTemporaria();
  const { salt, hash } = hashSenha(senhaTemporaria);
  await db.collection('usuarios').updateOne(
    { id: alvo.id },
    { $set: { senha_hash: hash, salt, senha_temporaria: true }, $unset: { senha: '' } }
  );
  await encerrarTodasSessoesDoUsuario(db, alvo.id);
  await registrarAuditoria(db, usuario, 'redefinir_senha', 'usuarios', { alvo: alvo.email });
  return { credencial_temporaria: senhaTemporaria };
}
