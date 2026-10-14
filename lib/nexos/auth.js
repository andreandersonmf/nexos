import { hashToken, gerarToken, verificarSenha, hashSenha } from './security';

export const COOKIE_SESSAO = 'nexos_sessao';
const SESSAO_TTL_MS = 8 * 60 * 60 * 1000; // 8 horas

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// ============ Sessões ============

export async function criarSessao(db, usuario, request) {
  const token = gerarToken();
  const agora = new Date();
  await db.collection('sessoes').insertOne({
    token_hash: hashToken(token),
    usuario_id: usuario.id,
    criado_em: agora,
    expira_em: new Date(agora.getTime() + SESSAO_TTL_MS),
    ip: request?.headers?.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
    user_agent: request?.headers?.get('user-agent')?.slice(0, 300) || null,
  });
  return token;
}

export async function encerrarSessao(db, request) {
  const token = extrairToken(request);
  if (token) {
    await db.collection('sessoes').deleteOne({ token_hash: hashToken(token) });
  }
}

export async function encerrarTodasSessoesDoUsuario(db, usuarioId) {
  await db.collection('sessoes').deleteMany({ usuario_id: usuarioId });
}

function extrairToken(request) {
  const cookie = request?.headers?.get('cookie') || '';
  const match = cookie.split(';').map((c) => c.trim()).find((c) => c.startsWith(`${COOKIE_SESSAO}=`));
  return match ? decodeURIComponent(match.slice(COOKIE_SESSAO.length + 1)) : null;
}

export function cookieOptions(request) {
  const secure = (request?.headers?.get('x-forwarded-proto') || '').split(',')[0] === 'https'
    || process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSAO_TTL_MS / 1000,
  };
}

export function serializarCookie(nome, valor, opts) {
  let c = `${nome}=${encodeURIComponent(valor)}`;
  if (opts.httpOnly) c += '; HttpOnly';
  if (opts.secure) c += '; Secure';
  if (opts.sameSite) c += `; SameSite=${opts.sameSite[0].toUpperCase()}${opts.sameSite.slice(1)}`;
  if (opts.path) c += `; Path=${opts.path}`;
  if (opts.maxAge != null) c += `; Max-Age=${opts.maxAge}`;
  return c;
}

// ============ Usuário da sessão ============

export async function getUsuarioDaSessao(db, request) {
  const token = extrairToken(request);
  if (!token) return null;
  const sessao = await db.collection('sessoes').findOne({ token_hash: hashToken(token) });
  if (!sessao) return null;
  if (sessao.expira_em && new Date(sessao.expira_em) < new Date()) {
    await db.collection('sessoes').deleteOne({ _id: sessao._id });
    return null;
  }
  const usuario = await db.collection('usuarios').findOne({ id: sessao.usuario_id });
  if (!usuario || usuario.status === 'inativo') return null;
  // Contas de aluno precisam da turma para escopos (comunicados, documentos);
  // contas antigas podem não ter o campo gravado — deriva da matrícula.
  if (usuario.perfil === 'ALUNO' && !usuario.turma_id && usuario.matricula_aluno) {
    const aluno = await db.collection('alunos').findOne({ matricula: usuario.matricula_aluno });
    if (aluno) usuario.turma_id = aluno.turma_id;
  }
  return sanitizarUsuario(usuario);
}

export function sanitizarUsuario(u) {
  const { senha, senha_hash, salt, _id, ...safe } = u;
  return {
    ...safe,
    turmas: Array.isArray(safe.turmas) ? safe.turmas : [],
    disciplinas: Array.isArray(safe.disciplinas) ? safe.disciplinas : [],
  };
}

// ============ Autorização ============

export function requireAuth(usuario) {
  if (!usuario) throw new ApiError(401, 'Sessão inválida ou expirada. Faça login novamente.');
  return usuario;
}

export function requirePerfil(usuario, perfis) {
  requireAuth(usuario);
  if (!perfis.includes(usuario.perfil)) {
    throw new ApiError(403, 'Você não tem permissão para realizar esta operação.');
  }
  return usuario;
}

export function ehEquipe(usuario) {
  return ['ADMIN', 'COORDENADOR', 'PROFESSOR'].includes(usuario?.perfil);
}

export function ehGestor(usuario) {
  return ['ADMIN', 'COORDENADOR'].includes(usuario?.perfil);
}

/**
 * Retorna o escopo de turmas do usuário.
 * { todas: boolean, ids: number[] }
 */
export function escopoTurmas(usuario) {
  if (!usuario) return { todas: false, ids: [] };
  if (usuario.perfil === 'ADMIN' || usuario.perfil === 'COORDENADOR') return { todas: true, ids: [] };
  if (usuario.perfil === 'PROFESSOR') return { todas: false, ids: usuario.turmas || [] };
  // ALUNO: apenas a própria turma (leitura própria)
  return { todas: false, ids: usuario.turma_id ? [usuario.turma_id] : [] };
}

/**
 * Professor pode gerenciar (escrever) apenas turmas explicitamente vinculadas.
 */
export function podeGerenciarTurma(usuario, turmaId) {
  const escopo = escopoTurmas(usuario);
  if (escopo.todas) return true;
  return escopo.ids.includes(Number(turmaId));
}

/**
 * Aluno só pode acessar a própria matrícula; professor só alunos de suas turmas.
 */
export function podeAcessarAluno(usuario, aluno) {
  if (!usuario || !aluno) return false;
  if (usuario.perfil === 'ADMIN' || usuario.perfil === 'COORDENADOR') return true;
  if (usuario.perfil === 'PROFESSOR') {
    return (usuario.turmas || []).includes(Number(aluno.turma_id));
  }
  if (usuario.perfil === 'ALUNO') {
    return usuario.matricula_aluno === aluno.matricula;
  }
  return false;
}

export function podeVerObservacoes(usuario) {
  return ehEquipe(usuario); // alunos não veem observações pedagógicas
}

export function podeVerAlertasInternos(usuario) {
  return ehEquipe(usuario); // alunos não veem alertas internos
}

// ============ Migração / primeiro acesso ============

/**
 * Faz upgrade de conta legada (senha em texto puro) para hash seguro.
 * Chamado após autenticação bem-sucedida de usuário com senha legada.
 */
export async function migrarSenhaLegada(db, usuario, senha) {
  if (!usuario.senha) return usuario;
  if (usuario.senha !== senha) return null;
  const { salt, hash } = hashSenha(senha);
  await db.collection('usuarios').updateOne(
    { id: usuario.id },
    { $set: { senha_hash: hash, salt }, $unset: { senha: '' } }
  );
  return { ...usuario, senha_hash: hash, salt, senha: undefined };
}

/**
 * Garante a estrutura mínima dos usuários legados (vínculos de turma dos professores demo).
 * Não altera campos já existentes — operação não destrutiva.
 */
export async function garantirEstruturaUsuarios(db) {
  const vínculosDemo = {
    'carlos@nexos.com': { turmas: [1, 2], disciplinas: [1, 3] },
    'julia@nexos.com': { turmas: [3, 4], disciplinas: [2] },
  };
  const usuarios = await db.collection('usuarios').find({}).toArray();
  for (const u of usuarios) {
    const set = {};
    if (u.perfil === 'PROFESSOR' && !Array.isArray(u.turmas)) {
      const vinculo = vínculosDemo[u.email] || { turmas: [], disciplinas: [] };
      set.turmas = vinculo.turmas;
      set.disciplinas = vinculo.disciplinas;
    }
    if (Object.keys(set).length) {
      await db.collection('usuarios').updateOne({ id: u.id }, { $set: set });
    }
  }
  return usuarios.length;
}

// Re-export para conveniência dos handlers
export { verificarSenha, hashSenha, gerarToken };
