import crypto from 'crypto';

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, keylen: 64 };

export function hashSenha(senha, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(senha), salt, SCRYPT_PARAMS.keylen, SCRYPT_PARAMS).toString('hex');
  return { salt, hash };
}

export function verificarSenha(senha, salt, hashEsperado) {
  if (!salt || !hashEsperado) return false;
  try {
    const hash = crypto.scryptSync(String(senha), salt, SCRYPT_PARAMS.keylen, SCRYPT_PARAMS).toString('hex');
    const a = Buffer.from(hash, 'hex');
    const b = Buffer.from(String(hashEsperado), 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function gerarToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function gerarSenhaTemporaria() {
  // 12 caracteres: letras e dígitos, sem símbolos ambíguos
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let out = '';
  const bytes = crypto.randomBytes(12);
  for (let i = 0; i < 12; i++) out += chars[bytes[i] % chars.length];
  return out;
}

// ============ Rate limit de login (por e-mail e por IP) ============
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_TENTATIVAS = 10;

export async function registrarTentativaLogin(db, email, ip, sucesso) {
  const now = Date.now();
  const janela = new Date(now - LOGIN_WINDOW_MS);
  await db.collection('tentativas_login').deleteMany({ data: { $lt: janela } });
  await db.collection('tentativas_login').insertOne({ email, ip, sucesso, data: new Date(now) });
}

export async function loginBloqueado(db, email, ip) {
  const janela = new Date(Date.now() - LOGIN_WINDOW_MS);
  const total = await db.collection('tentativas_login').countDocuments({
    sucesso: false,
    data: { $gte: janela },
    $or: [{ email }, { ip }],
  });
  return total >= LOGIN_MAX_TENTATIVAS;
}

export async function limparTentativasLogin(db, email, ip) {
  await db.collection('tentativas_login').deleteMany({ $or: [{ email }, { ip }] });
}

// ============ Auditoria de operações sensíveis ============
export async function registrarAuditoria(db, usuario, acao, recurso, detalhes = {}) {
  try {
    await db.collection('auditoria').insertOne({
      usuario_id: usuario?.id ?? null,
      usuario_nome: usuario?.nome ?? 'Sistema',
      perfil: usuario?.perfil ?? null,
      acao,
      recurso,
      detalhes,
      data: new Date().toISOString(),
    });
  } catch {
    // auditoria não pode quebrar a operação principal
  }
}
