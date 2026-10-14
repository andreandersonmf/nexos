import { ApiError, requirePerfil, podeGerenciarTurma } from '@/lib/nexos/auth';
import { mediaDe, mediaPorDisciplina, evolucaoPorBimestre, sincronizarAlertasAutomaticos, proximoId } from '@/lib/nexos/metrics';
import { registrarAuditoria } from '@/lib/nexos/security';

export async function listarDisciplinas(db, usuario) {
  requirePerfil(usuario, ['ADMIN', 'COORDENADOR', 'PROFESSOR', 'ALUNO']);
  const disciplinas = await db.collection('disciplinas').find({}).sort({ nome: 1 }).toArray();
  return { items: disciplinas.map(({ _id, ...d }) => d) };
}

export async function listarNotas(db, usuario, query) {
  requirePerfil(usuario, ['ADMIN', 'COORDENADOR', 'PROFESSOR']);
  const turmaId = parseInt(query.get('turma_id'), 10);
  const disciplinaId = parseInt(query.get('disciplina_id'), 10);
  const bimestre = parseInt(query.get('bimestre'), 10);
  if (!turmaId || !disciplinaId || !bimestre) {
    throw new ApiError(400, 'turma_id, disciplina_id e bimestre são obrigatórios.');
  }
  if (!podeGerenciarTurma(usuario, turmaId)) {
    throw new ApiError(403, 'Você não está vinculado a esta turma.');
  }
  if (usuario.perfil === 'PROFESSOR' && (usuario.disciplinas || []).length && !usuario.disciplinas.includes(disciplinaId)) {
    throw new ApiError(403, 'Você não está vinculado a esta disciplina.');
  }

  const [alunos, notas, disciplina] = await Promise.all([
    db.collection('alunos').find({ turma_id: turmaId }).sort({ nome: 1 }).toArray(),
    db.collection('notas').find({ disciplina_id: disciplinaId, bimestre }).toArray(),
    db.collection('disciplinas').findOne({ id: disciplinaId }),
  ]);
  const notaMap = Object.fromEntries(notas.map((n) => [n.matricula_aluno, n.valor]));
  const items = alunos.map((a) => ({
    matricula: a.matricula, nome: a.nome,
    valor: notaMap[a.matricula] ?? null,
  }));
  return { items, disciplina: disciplina?.nome, turma_id: turmaId, disciplina_id: disciplinaId, bimestre };
}

export async function salvarNotasEmLote(db, usuario, body) {
  requirePerfil(usuario, ['ADMIN', 'COORDENADOR', 'PROFESSOR']);
  const { turma_id, disciplina_id, bimestre, notas } = body || {};
  const turmaId = parseInt(turma_id, 10);
  const disciplinaId = parseInt(disciplina_id, 10);
  const bim = parseInt(bimestre, 10);
  if (!turmaId || !disciplinaId || !bim || !Array.isArray(notas)) {
    throw new ApiError(400, 'Payload inválido.');
  }
  if (bim < 1 || bim > 4) throw new ApiError(400, 'Bimestre inválido (1 a 4).');
  if (!podeGerenciarTurma(usuario, turmaId)) {
    throw new ApiError(403, 'Você não está vinculado a esta turma.');
  }
  if (usuario.perfil === 'PROFESSOR' && (usuario.disciplinas || []).length && !usuario.disciplinas.includes(disciplinaId)) {
    throw new ApiError(403, 'Você não está vinculado a esta disciplina.');
  }

  const [turma, disciplina, alunosTurma] = await Promise.all([
    db.collection('turmas').findOne({ id: turmaId }),
    db.collection('disciplinas').findOne({ id: disciplinaId }),
    db.collection('alunos').find({ turma_id: turmaId }).toArray(),
  ]);
  if (!turma) throw new ApiError(404, 'Turma não encontrada.');
  if (!disciplina) throw new ApiError(404, 'Disciplina não encontrada.');
  const matriculasTurma = new Set(alunosTurma.map((a) => a.matricula));

  let gravadas = 0, removidas = 0;
  for (const n of notas.slice(0, 500)) {
    const matricula = n?.matricula_aluno || n?.matricula;
    if (!matricula || !matriculasTurma.has(matricula)) continue; // somente alunos da turma
    const valor = n.valor;
    const filtro = { matricula_aluno: matricula, disciplina_id: disciplinaId, bimestre: bim };
    if (valor == null || valor === '' || isNaN(parseFloat(valor))) {
      const r = await db.collection('notas').deleteMany(filtro);
      removidas += r.deletedCount;
      continue;
    }
    const v = Math.max(0, Math.min(10, Math.round(parseFloat(valor) * 10) / 10));
    await db.collection('notas').updateOne(filtro, {
      $set: {
        ...filtro, disciplina_nome: disciplina.nome,
        valor: v, data_lancamento: new Date().toISOString(),
      },
      $setOnInsert: { id: Date.now() + Math.floor(Math.random() * 1000) },
    }, { upsert: true });
    gravadas++;
  }

  await db.collection('atividades').insertOne({
    id: await proximoId(db, 'atividades'),
    tipo: 'nota',
    descricao: `${usuario.nome} publicou notas de ${disciplina.nome} (${turma.nome}, ${bim}º bimestre).`,
    data: new Date().toISOString(),
  });
  await registrarAuditoria(db, usuario, 'lancar_notas', 'notas', { turma: turmaId, disciplina: disciplinaId, bimestre: bim, gravadas });
  await sincronizarAlertasAutomaticos(db, { filtroAlunos: { turma_id: turmaId } });
  return { gravadas, removidas };
}

/**
 * Resumo de desempenho para gráficos: médias por disciplina, por bimestre e por turma.
 */
export async function resumoDesempenho(db, usuario, query) {
  requirePerfil(usuario, ['ADMIN', 'COORDENADOR', 'PROFESSOR']);
  const turmaId = parseInt(query.get('turma_id'), 10);

  let filtroAlunos = {};
  if (usuario.perfil === 'PROFESSOR') {
    if (!Number.isNaN(turmaId) && !podeGerenciarTurma(usuario, turmaId)) {
      throw new ApiError(403, 'Você não está vinculado a esta turma.');
    }
    filtroAlunos = { turma_id: { $in: usuario.turmas || [] } };
  } else if (!Number.isNaN(turmaId)) {
    filtroAlunos = { turma_id: turmaId };
  }

  const [alunos, notas, turmas, disciplinas] = await Promise.all([
    db.collection('alunos').find(filtroAlunos).toArray(),
    db.collection('notas').find({}).toArray(),
    db.collection('turmas').find({}).toArray(),
    db.collection('disciplinas').find({}).toArray(),
  ]);
  const matriculas = new Set(alunos.map((a) => a.matricula));
  const notasEscopo = notas.filter((n) => matriculas.has(n.matricula_aluno));
  const turmaMap = Object.fromEntries(turmas.map((t) => [t.id, t.nome]));
  const discMap = Object.fromEntries(disciplinas.map((d) => [d.id, d.nome]));

  const porDisciplina = mediaPorDisciplina(notasEscopo).map(({ chave, media, total }) => ({
    disciplina_id: typeof chave === 'number' ? chave : null,
    disciplina: discMap[chave] || chave,
    media,
    totalNotas: total,
  })).sort((a, b) => (a.media ?? -1) - (b.media ?? -1));

  // evolução geral por bimestre
  const porBim = {};
  for (const n of notasEscopo) (porBim[n.bimestre] ||= []).push(n.valor);
  const evolucaoBimestres = Object.keys(porBim).map(Number).sort((a, b) => a - b).map((bim) => ({
    bimestre: bim,
    media: mediaDe(porBim[bim]),
    totalNotas: porBim[bim].length,
  }));

  // média por turma
  const porTurma = {};
  for (const a of alunos) {
    const na = notasEscopo.filter((n) => n.matricula_aluno === a.matricula);
    if (!porTurma[a.turma_id]) porTurma[a.turma_id] = [];
    const media = mediaDe(na.map((n) => n.valor));
    if (media != null) porTurma[a.turma_id].push(media);
  }
  const mediasPorTurma = Object.entries(porTurma).map(([tid, medias]) => ({
    turma_id: Number(tid),
    turma: turmaMap[Number(tid)] || tid,
    media: mediaDe(medias),
    alunosAvaliados: medias.length,
  })).sort((a, b) => (a.media ?? -1) - (b.media ?? -1));

  // quedas de desempenho (variação negativa entre bimestres)
  const quedas = alunos.map((a) => {
    const na = notasEscopo.filter((n) => n.matricula_aluno === a.matricula);
    const evol = evolucaoPorBimestre(na);
    const comVariacao = evol.filter((e) => e.variacao != null);
    const ultima = comVariacao[comVariacao.length - 1];
    return { matricula: a.matricula, nome: a.nome, turma_id: a.turma_id, turma: turmaMap[a.turma_id], variacao: ultima?.variacao ?? null, bimestre: ultima?.bimestre ?? null };
  }).filter((q) => q.variacao != null && q.variacao < 0)
    .sort((a, b) => a.variacao - b.variacao);

  return {
    porDisciplina,
    evolucaoBimestres,
    mediasPorTurma,
    quedas: quedas.slice(0, 30),
    totalAlunos: alunos.length,
  };
}
