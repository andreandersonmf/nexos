import { ApiError, requirePerfil, podeGerenciarTurma } from '@/lib/nexos/auth';
import { calcularMetricasAlunos, proximoId, anoLetivoAtual } from '@/lib/nexos/metrics';
import { registrarAuditoria } from '@/lib/nexos/security';

export async function listarTurmas(db, usuario) {
  const [turmas, alunos] = await Promise.all([
    db.collection('turmas').find({}).sort({ nome: 1 }).toArray(),
    db.collection('alunos').find({}).toArray(),
  ]);
  const professores = await db.collection('usuarios').find({ perfil: 'PROFESSOR' }).toArray();
  const profPorTurma = {};
  for (const p of professores) {
    for (const t of p.turmas || []) (profPorTurma[t] ||= []).push(p.nome);
  }
  const items = turmas.map((t) => ({
    ...t,
    _id: undefined,
    totalAlunos: alunos.filter((a) => a.turma_id === t.id).length,
    professores: profPorTurma[t.id] || [],
  }));
  return { items };
}

export async function criarTurma(db, usuario, body) {
  requirePerfil(usuario, ['ADMIN', 'COORDENADOR']);
  const { nome, turno, ano_letivo } = body || {};
  if (typeof nome !== 'string' || !nome.trim()) throw new ApiError(400, 'Nome da turma é obrigatório.');
  const turnos = ['Manhã', 'Tarde', 'Noite', 'Integral'];
  const turnoValido = turnos.includes(turno) ? turno : 'Manhã';
  const ano = Number(ano_letivo) || await anoLetivoAtual(db);
  const turma = { id: await proximoId(db, 'turmas'), nome: nome.trim().slice(0, 60), turno: turnoValido, ano_letivo: ano };
  await db.collection('turmas').insertOne(turma);
  await registrarAuditoria(db, usuario, 'criar_turma', 'turmas', { turma: turma.nome });
  return { turma };
}

export async function atualizarTurma(db, usuario, id, body) {
  requirePerfil(usuario, ['ADMIN', 'COORDENADOR']);
  const turma = await db.collection('turmas').findOne({ id: Number(id) });
  if (!turma) throw new ApiError(404, 'Turma não encontrada.');
  const set = {};
  const { nome, turno, ano_letivo } = body || {};
  if (nome !== undefined) {
    if (typeof nome !== 'string' || !nome.trim()) throw new ApiError(400, 'Nome inválido.');
    set.nome = nome.trim().slice(0, 60);
  }
  if (turno !== undefined) set.turno = String(turno).slice(0, 30);
  if (ano_letivo !== undefined) set.ano_letivo = Number(ano_letivo);
  if (Object.keys(set).length) await db.collection('turmas').updateOne({ id: turma.id }, { $set: set });
  await registrarAuditoria(db, usuario, 'atualizar_turma', 'turmas', { id: turma.id, campos: Object.keys(set) });
  return { turma: { ...turma, ...set, _id: undefined } };
}

export async function detalharTurma(db, usuario, id) {
  const tid = Number(id);
  const turma = await db.collection('turmas').findOne({ id: tid });
  if (!turma) throw new ApiError(404, 'Turma não encontrada.');
  // Professor só acessa detalhes das turmas vinculadas
  if (usuario.perfil === 'PROFESSOR' && !(usuario.turmas || []).includes(tid)) {
    throw new ApiError(403, 'Você não está vinculado a esta turma.');
  }
  if (usuario.perfil === 'ALUNO') {
    throw new ApiError(403, 'Alunos não têm acesso à administração de turmas.');
  }

  const { byAluno } = await calcularMetricasAlunos(db, { filtroAlunos: { turma_id: tid } });
  const alertas = await db.collection('alertas').find({ status: 'aberto' }).toArray();
  const alertasPorAluno = {};
  for (const al of alertas) alertasPorAluno[al.matricula_aluno] = (alertasPorAluno[al.matricula_aluno] || 0) + 1;

  const alunosList = Object.values(byAluno).map(({ aluno, media, freqPct, totalFaltas }) => ({
    matricula: aluno.matricula,
    nome: aluno.nome,
    media,
    freqPct,
    faltas: totalFaltas,
    alertas: alertasPorAluno[aluno.matricula] || 0,
  })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  const medias = alunosList.filter((a) => a.media != null).map((a) => a.media);
  const freqs = alunosList.filter((a) => a.freqPct != null).map((a) => a.freqPct);
  const metricas = {
    totalAlunos: alunosList.length,
    mediaGeral: medias.length ? Math.round((medias.reduce((s, v) => s + v, 0) / medias.length) * 10) / 10 : null,
    freqMedia: freqs.length ? Math.round((freqs.reduce((s, v) => s + v, 0) / freqs.length) * 10) / 10 : null,
    totalAlertas: alunosList.reduce((s, a) => s + a.alertas, 0),
  };

  const professoresTurma = await db.collection('usuarios').find({ perfil: 'PROFESSOR', turmas: tid }).toArray();
  return {
    turma: { ...turma, _id: undefined },
    alunos: alunosList,
    metricas,
    professores: professoresTurma.map((p) => ({ id: p.id, nome: p.nome, cargo: p.cargo, disciplinas: p.disciplinas || [] })),
  };
}

/**
 * Atribuir/remover professores da turma (ADMIN e COORDENADOR).
 */
export async function gerenciarProfessoresTurma(db, usuario, id, body) {
  requirePerfil(usuario, ['ADMIN', 'COORDENADOR']);
  const turma = await db.collection('turmas').findOne({ id: Number(id) });
  if (!turma) throw new ApiError(404, 'Turma não encontrada.');
  const { usuario_id, acao } = body || {};
  if (!['adicionar', 'remover'].includes(acao)) throw new ApiError(400, 'Ação inválida (adicionar/remover).');
  const prof = await db.collection('usuarios').findOne({ id: Number(usuario_id), perfil: 'PROFESSOR' });
  if (!prof) throw new ApiError(404, 'Professor não encontrado.');

  const turmasAtuais = new Set(prof.turmas || []);
  if (acao === 'adicionar') turmasAtuais.add(turma.id);
  else turmasAtuais.delete(turma.id);
  await db.collection('usuarios').updateOne({ id: prof.id }, { $set: { turmas: [...turmasAtuais] } });
  await registrarAuditoria(db, usuario, 'vincular_professor', 'turmas', { turma: turma.id, professor: prof.email, acao });
  return { ok: true, turmas: [...turmasAtuais] };
}
