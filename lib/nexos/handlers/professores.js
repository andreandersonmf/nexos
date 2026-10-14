import { ApiError, requirePerfil, sanitizarUsuario } from '@/lib/nexos/auth';
import { proximoId } from '@/lib/nexos/metrics';

export async function listarProfessores(db, usuario) {
  requirePerfil(usuario, ['ADMIN', 'COORDENADOR', 'PROFESSOR']);
  const [professores, turmas, disciplinas] = await Promise.all([
    db.collection('usuarios').find({ perfil: 'PROFESSOR', status: { $ne: 'inativo' } }).sort({ nome: 1 }).toArray(),
    db.collection('turmas').find({}).toArray(),
    db.collection('disciplinas').find({}).toArray(),
  ]);
  const turmaMap = Object.fromEntries(turmas.map((t) => [t.id, t.nome]));
  const discMap = Object.fromEntries(disciplinas.map((d) => [d.id, d.nome]));
  const items = professores.map((p) => ({
    ...sanitizarUsuario(p),
    turmas_nomes: (p.turmas || []).map((t) => turmaMap[t] || t),
    disciplinas_nomes: (p.disciplinas || []).map((d) => discMap[d] || d),
  }));
  return { items };
}

export async function detalharProfessor(db, usuario, id) {
  requirePerfil(usuario, ['ADMIN', 'COORDENADOR', 'PROFESSOR']);
  const prof = await db.collection('usuarios').findOne({ id: Number(id), perfil: 'PROFESSOR' });
  if (!prof) throw new ApiError(404, 'Professor não encontrado.');
  const [turmas, disciplinas] = await Promise.all([
    db.collection('turmas').find({}).toArray(),
    db.collection('disciplinas').find({}).toArray(),
  ]);
  const turmaMap = Object.fromEntries(turmas.map((t) => [t.id, t]));
  const discMap = Object.fromEntries(disciplinas.map((d) => [d.id, d]));
  return {
    professor: {
      ...sanitizarUsuario(prof),
      turmas_detalhes: (prof.turmas || []).map((t) => turmaMap[t]).filter(Boolean),
      disciplinas_detalhes: (prof.disciplinas || []).map((d) => discMap[d]).filter(Boolean),
    },
    turmas: turmas.map(({ _id, ...t }) => t),
    disciplinas: disciplinas.map(({ _id, ...d }) => d),
  };
}

// ============ Mensagens internas (chat entre professores/gestores) ============

export async function listarConversas(db, usuario) {
  requirePerfil(usuario, ['ADMIN', 'COORDENADOR', 'PROFESSOR']);
  const mensagens = await db.collection('mensagens').find({
    $or: [{ remetente_id: usuario.id }, { destinatario_id: usuario.id }],
  }).sort({ data: -1 }).limit(500).toArray();

  const ids = new Set();
  for (const m of mensagens) {
    if (m.remetente_id !== usuario.id) ids.add(m.remetente_id);
    if (m.destinatario_id !== usuario.id) ids.add(m.destinatario_id);
  }
  const pessoas = await db.collection('usuarios').find({ id: { $in: [...ids] } }).toArray();
  const pessoaMap = Object.fromEntries(pessoas.map((p) => [p.id, sanitizarUsuario(p)]));

  const porPar = {};
  for (const m of mensagens) {
    const outro = m.remetente_id === usuario.id ? m.destinatario_id : m.remetente_id;
    if (!porPar[outro] || new Date(m.data) > new Date(porPar[outro].data)) porPar[outro] = m;
  }
  const conversas = Object.entries(porPar).map(([outroId, ultima]) => ({
    usuario_id: Number(outroId),
    pessoa: pessoaMap[Number(outroId)] || { id: Number(outroId), nome: 'Usuário removido', perfil: 'PROFESSOR' },
    ultima_mensagem: ultima.conteudo,
    data: ultima.data,
    nao_lidas: mensagens.filter((m) => m.remetente_id === Number(outroId) && m.destinatario_id === usuario.id && !m.lida).length,
  })).sort((a, b) => new Date(b.data) - new Date(a.data));
  return { conversas };
}

export async function historicoConversa(db, usuario, outroId) {
  requirePerfil(usuario, ['ADMIN', 'COORDENADOR', 'PROFESSOR']);
  const outro = await db.collection('usuarios').findOne({ id: Number(outroId) });
  if (!outro) throw new ApiError(404, 'Usuário não encontrado.');
  const mensagens = await db.collection('mensagens').find({
    $or: [
      { remetente_id: usuario.id, destinatario_id: Number(outroId) },
      { remetente_id: Number(outroId), destinatario_id: usuario.id },
    ],
  }).sort({ data: 1 }).limit(200).toArray();
  // marca como lidas
  await db.collection('mensagens').updateMany(
    { remetente_id: Number(outroId), destinatario_id: usuario.id, lida: { $ne: true } },
    { $set: { lida: true } }
  );
  return {
    pessoa: sanitizarUsuario(outro),
    mensagens: mensagens.map(({ _id, ...m }) => m),
  };
}

export async function enviarMensagem(db, usuario, body) {
  requirePerfil(usuario, ['ADMIN', 'COORDENADOR', 'PROFESSOR']);
  const destinatarioId = Number(body?.destinatario_id);
  const conteudo = typeof body?.conteudo === 'string' ? body.conteudo.trim() : '';
  if (!destinatarioId) throw new ApiError(400, 'Destinatário é obrigatório.');
  if (!conteudo) throw new ApiError(400, 'Mensagem vazia.');
  if (conteudo.length > 4000) throw new ApiError(400, 'Mensagem muito longa (máx. 4000 caracteres).');
  if (destinatarioId === usuario.id) throw new ApiError(400, 'Você não pode enviar mensagem para si mesmo.');

  const destinatario = await db.collection('usuarios').findOne({ id: destinatarioId });
  if (!destinatario) throw new ApiError(404, 'Destinatário não encontrado.');
  if (!['ADMIN', 'COORDENADOR', 'PROFESSOR'].includes(destinatario.perfil)) {
    throw new ApiError(400, 'Não é possível conversar com este perfil.');
  }

  const msg = {
    id: await proximoId(db, 'mensagens'),
    remetente_id: usuario.id,
    destinatario_id: destinatarioId,
    conteudo,
    data: new Date().toISOString(),
    lida: false,
  };
  await db.collection('mensagens').insertOne(msg);
  return { mensagem: msg };
}
