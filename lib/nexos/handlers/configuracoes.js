import { ApiError } from '@/lib/nexos/auth';
import { hashSenha, verificarSenha, registrarAuditoria } from '@/lib/nexos/security';
import { sanitizarUsuario } from '@/lib/nexos/auth';

const CHAVES_ACADEMICAS = new Set(['ano_letivo', 'bimestres_ativos', 'limite_frequencia_alerta_media', 'limite_frequencia_alerta_alta', 'media_minima_aprovacao']);
const CHAVES_INSTITUCIONAIS = new Set(['nome_instituicao', 'email_contato']);

export async function obterConfiguracoes(db, usuario) {
  const todas = await db.collection('configuracoes').find({}).toArray();
  const grupos = { instituicao: [], academico: [] };
  for (const c of todas) {
    if (grupos[c.grupo]) grupos[c.grupo].push({ chave: c.chave, valor: c.valor, grupo: c.grupo });
  }
  const resposta = { perfil: sanitizarUsuario(usuario), grupos };

  if (['ALUNO', 'RESPONSAVEL'].includes(usuario.perfil)) {
    // Aluno vê apenas o próprio perfil — sem configurações institucionais
    return {
      perfil: sanitizarUsuario(usuario),
      grupos: { instituicao: [], academico: [] },
      apenas_perfil: true,
    };
  }
  if (usuario.perfil === 'PROFESSOR') {
    return { perfil: sanitizarUsuario(usuario), grupos: { instituicao: grupos.instituicao, academico: [] }, apenas_perfil: false };
  }
  return resposta;
}

export async function atualizarConfiguracao(db, usuario, body) {
  const { chave, valor } = body || {};
  if (typeof chave !== 'string' || !chave.trim()) throw new ApiError(400, 'Chave de configuração é obrigatória.');
  if (typeof valor !== 'string') throw new ApiError(400, 'Valor inválido.');

  let permitido = false;
  if (usuario.perfil === 'ADMIN') {
    permitido = CHAVES_ACADEMICAS.has(chave) || CHAVES_INSTITUCIONAIS.has(chave);
  } else if (usuario.perfil === 'COORDENADOR') {
    permitido = CHAVES_ACADEMICAS.has(chave);
  } else {
    throw new ApiError(403, 'Seu perfil não pode alterar configurações institucionais.');
  }
  if (!permitido) throw new ApiError(403, 'Esta configuração não pode ser alterada pelo seu perfil.');

  // validações específicas
  if (chave === 'ano_letivo') {
    const ano = parseInt(valor, 10);
    if (Number.isNaN(ano) || ano < 2000 || ano > 2100) throw new ApiError(400, 'Ano letivo inválido.');
  }
  if (chave === 'bimestres_ativos') {
    const n = parseInt(valor, 10);
    if (Number.isNaN(n) || n < 1 || n > 4) throw new ApiError(400, 'Bimestres ativos deve estar entre 1 e 4.');
  }
  if (chave.startsWith('limite_') || chave === 'media_minima_aprovacao') {
    const n = parseFloat(valor);
    if (Number.isNaN(n) || n < 0 || n > 100) throw new ApiError(400, 'Valor numérico inválido.');
  }

  await db.collection('configuracoes').updateOne(
    { chave },
    { $set: { valor: valor.slice(0, 200) } },
    { upsert: true }
  );
  await registrarAuditoria(db, usuario, 'atualizar_configuracao', 'configuracoes', { chave });
  return { ok: true, chave, valor };
}

/**
 * Atualização do próprio perfil.
 * ALUNO: apenas nome e e-mail (nunca matrícula, notas, frequência ou perfil).
 */
export async function atualizarPerfil(db, usuario, body) {
  const { nome, email } = body || {};
  const set = {};
  if (nome !== undefined) {
    if (typeof nome !== 'string' || !nome.trim() || nome.trim().length > 120) {
      throw new ApiError(400, 'Nome inválido.');
    }
    set.nome = nome.trim();
  }
  if (email !== undefined) {
    const emailLimpo = String(email).toLowerCase().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(emailLimpo)) throw new ApiError(400, 'E-mail inválido.');
    const existente = await db.collection('usuarios').findOne({ email: emailLimpo, id: { $ne: usuario.id } });
    if (existente) throw new ApiError(409, 'Este e-mail já está em uso por outra conta.');
    set.email = emailLimpo;
  }
  if (Object.keys(set).length) {
    await db.collection('usuarios').updateOne({ id: usuario.id }, { $set: set });
  }
  const atualizado = await db.collection('usuarios').findOne({ id: usuario.id });
  return { perfil: sanitizarUsuario(atualizado) };
}

/**
 * Alteração da própria senha (usuário autenticado).
 */
export async function alterarPropriaSenha(db, usuario, body) {
  const { senha_atual, nova_senha } = body || {};
  if (typeof nova_senha !== 'string' || nova_senha.length < 8 || nova_senha.length > 100) {
    throw new ApiError(400, 'A nova senha deve ter entre 8 e 100 caracteres.');
  }
  const user = await db.collection('usuarios').findOne({ id: usuario.id });
  if (!user) throw new ApiError(404, 'Usuário não encontrado.');

  if (!user.senha_temporaria) {
    if (typeof senha_atual !== 'string' || !senha_atual) throw new ApiError(400, 'Informe a senha atual.');
    let valida = false;
    if (user.senha_hash && user.salt) {
      valida = verificarSenha(senha_atual, user.salt, user.senha_hash);
    } else if (user.senha != null) {
      valida = user.senha === senha_atual;
    }
    if (!valida) throw new ApiError(401, 'Senha atual incorreta.');
  }
  if (user.senha_hash && verificarSenha(nova_senha, user.salt, user.senha_hash)) {
    throw new ApiError(400, 'A nova senha deve ser diferente da anterior.');
  }

  const { salt, hash } = hashSenha(nova_senha);
  await db.collection('usuarios').updateOne(
    { id: usuario.id },
    { $set: { senha_hash: hash, salt, senha_temporaria: false }, $unset: { senha: '' } }
  );
  await registrarAuditoria(db, usuario, 'alterar_senha', 'perfil', {});
  return { ok: true };
}
