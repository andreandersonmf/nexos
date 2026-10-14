import { ApiError, criarSessao, encerrarSessao, migrarSenhaLegada, verificarSenha, hashSenha } from '@/lib/nexos/auth';
import { registrarTentativaLogin, loginBloqueado, limparTentativasLogin, registrarAuditoria } from '@/lib/nexos/security';

function ipDoRequest(request) {
  return request?.headers?.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
}

export async function login(db, request, body) {
  const { email, senha } = body || {};
  if (!email || !senha) throw new ApiError(400, 'E-mail e senha são obrigatórios.');
  if (typeof email !== 'string' || typeof senha !== 'string' || email.length > 200 || senha.length > 200) {
    throw new ApiError(400, 'Dados de login inválidos.');
  }

  const ip = ipDoRequest(request);
  const emailNormalizado = email.toLowerCase().trim();
  if (await loginBloqueado(db, emailNormalizado, ip)) {
    throw new ApiError(429, 'Muitas tentativas de login. Aguarde alguns minutos e tente novamente.');
  }

  const user = await db.collection('usuarios').findOne({ email: emailNormalizado });
  if (!user) {
    await registrarTentativaLogin(db, emailNormalizado, ip, false);
    throw new ApiError(401, 'Credenciais inválidas.');
  }
  if (user.status === 'inativo') {
    throw new ApiError(403, 'Conta desativada. Entre em contato com a administração.');
  }

  let autenticado = false;
  if (user.senha_hash && user.salt) {
    autenticado = verificarSenha(senha, user.salt, user.senha_hash);
  } else if (user.senha != null) {
    // Conta legada (senha em texto puro): valida e migra para hash seguro
    const migrado = await migrarSenhaLegada(db, user, senha);
    autenticado = !!migrado;
    if (migrado) user.senha_hash = migrado.senha_hash;
  }
  if (!autenticado) {
    await registrarTentativaLogin(db, emailNormalizado, ip, false);
    throw new ApiError(401, 'Credenciais inválidas.');
  }

  await limparTentativasLogin(db, emailNormalizado, ip);
  await registrarTentativaLogin(db, emailNormalizado, ip, true);
  const token = await criarSessao(db, user, request);
  await registrarAuditoria(db, user, 'login', 'auth', {});
  const { senha: _, senha_hash: __, salt: ___, _id: ____, ...safe } = user;
  return {
    token,
    usuario: {
      ...safe,
      turmas: Array.isArray(safe.turmas) ? safe.turmas : [],
      disciplinas: Array.isArray(safe.disciplinas) ? safe.disciplinas : [],
    },
  };
}

export async function logout(db, request, usuario) {
  await encerrarSessao(db, request);
  if (usuario) await registrarAuditoria(db, usuario, 'logout', 'auth', {});
  return { ok: true };
}

export async function me(db, request, usuario) {
  return { usuario };
}

export async function alterarSenha(db, request, usuario, body) {
  const { senha_atual, nova_senha } = body || {};
  if (typeof nova_senha !== 'string' || nova_senha.length < 8) {
    throw new ApiError(400, 'A nova senha deve ter pelo menos 8 caracteres.');
  }
  if (nova_senha.length > 100) throw new ApiError(400, 'Senha muito longa.');

  const user = await db.collection('usuarios').findOne({ id: usuario.id });
  if (!user) throw new ApiError(404, 'Usuário não encontrado.');

  // Usuários com senha temporária não precisam informar a senha atual (primeiro acesso)
  if (!user.senha_temporaria) {
    if (typeof senha_atual !== 'string' || !senha_atual) {
      throw new ApiError(400, 'Informe a senha atual.');
    }
    let valida = false;
    if (user.senha_hash && user.salt) {
      valida = verificarSenha(senha_atual, user.salt, user.senha_hash);
    } else if (user.senha != null) {
      valida = user.senha === senha_atual;
    }
    if (!valida) throw new ApiError(401, 'Senha atual incorreta.');
  }

  if (user.senha_hash) {
    const antiga = verificarSenha(nova_senha, user.salt, user.senha_hash);
    if (antiga) throw new ApiError(400, 'A nova senha deve ser diferente da anterior.');
  }

  const { salt, hash } = hashSenha(nova_senha);
  await db.collection('usuarios').updateOne(
    { id: usuario.id },
    { $set: { senha_hash: hash, salt, senha_temporaria: false }, $unset: { senha: '' } }
  );
  await registrarAuditoria(db, usuario, 'alterar_senha', 'auth', {});
  return { ok: true };
}
