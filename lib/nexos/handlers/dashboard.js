import { calcularMetricasAlunos } from '@/lib/nexos/metrics';
import { ehEquipe } from '@/lib/nexos/auth';

export async function dashboard(db, usuario) {
  if (['ALUNO', 'RESPONSAVEL'].includes(usuario.perfil)) return dashboardAluno(db, usuario);

  const escopoAlunos = usuario.perfil === 'PROFESSOR'
    ? { turma_id: { $in: usuario.turmas || [] } }
    : {};
  const { byAluno } = await calcularMetricasAlunos(db, { filtroAlunos: escopoAlunos });
  const alunosEscopo = Object.values(byAluno);

  const [totalTurmas, totalProfessores, atividades, alertasTodos, comunicados] = await Promise.all([
    db.collection('turmas').countDocuments(),
    db.collection('usuarios').countDocuments({ perfil: 'PROFESSOR', status: { $ne: 'inativo' } }),
    db.collection('atividades').find({}).sort({ data: -1 }).limit(8).toArray(),
    db.collection('alertas').find({ status: 'aberto' }).toArray(),
    db.collection('comunicados').find({ status: 'publicado' }).sort({ data_publicacao: -1 }).limit(5).toArray(),
  ]);

  // alertas do escopo do usuário
  const matriculasEscopo = new Set(alunosEscopo.map((m) => m.aluno.matricula));
  const alertasEscopo = alertasTodos.filter((a) => matriculasEscopo.has(a.matricula_aluno));
  const prioOrdem = { alta: 0, media: 1, baixa: 2 };
  const alertasPrioritarios = alertasEscopo
    .sort((a, b) => (prioOrdem[a.prioridade] ?? 3) - (prioOrdem[b.prioridade] ?? 3))
    .slice(0, 5)
    .map((al) => ({
      ...al, _id: undefined,
      aluno_nome: byAluno[al.matricula_aluno]?.aluno?.nome || '—',
      turma: byAluno[al.matricula_aluno]?.turma?.nome || '—',
    }));

  const medias = alunosEscopo.filter((m) => m.media != null).map((m) => m.media);
  const freqs = alunosEscopo.filter((m) => m.freqPct != null).map((m) => m.freqPct);
  const freqMedia = freqs.length
    ? Math.round((freqs.reduce((s, v) => s + v, 0) / freqs.length) * 10) / 10
    : null;
  const mediaGeral = medias.length
    ? Math.round((medias.reduce((s, v) => s + v, 0) / medias.length) * 10) / 10
    : null;

  // frequência por turma (escopo)
  const porTurma = {};
  for (const m of alunosEscopo) {
    if (m.freqPct == null) continue;
    const tid = m.aluno.turma_id;
    porTurma[tid] ||= { total: 0, soma: 0 };
    porTurma[tid].total++;
    porTurma[tid].soma += m.freqPct;
  }
  const frequenciaPorTurma = Object.entries(porTurma)
    .map(([tid, v]) => ({
      turma: byAluno[Object.keys(byAluno).find((k) => byAluno[k].aluno.turma_id === Number(tid))]?.turma?.nome || tid,
      percentual: v.total ? Math.round((v.soma / v.total) * 10) / 10 : 0,
    }))
    .sort((a, b) => a.turma.localeCompare(b.turma));

  const abaixoMedia = alunosEscopo.filter((m) => m.media != null && m.media < 6).length;
  const freqBaixa = alunosEscopo.filter((m) => m.freqPct != null && m.freqPct < 75).length;

  return {
    escopo: usuario.perfil === 'PROFESSOR' ? 'turmas' : 'institucional',
    metricas: {
      alunos: alunosEscopo.length,
      turmas: usuario.perfil === 'PROFESSOR' ? (usuario.turmas || []).length : totalTurmas,
      professores: usuario.perfil === 'PROFESSOR' ? null : totalProfessores,
      alertasAbertos: alertasEscopo.length,
      frequenciaMedia: freqMedia, // null quando não há registros
      mediaGeral,
      abaixoMedia,
      freqBaixa,
    },
    alertasPrioritarios,
    atividadesRecentes: atividades.map(({ _id, ...a }) => a),
    frequenciaPorTurma,
    comunicadosRecentes: comunicados.map(({ _id, ...c }) => ({ id: c.id, titulo: c.titulo, data_publicacao: c.data_publicacao })),
  };
}

async function dashboardAluno(db, usuario) {
  const { byAluno } = await calcularMetricasAlunos(db, { filtroAlunos: { matricula: usuario.matricula_aluno } });
  const m = byAluno[usuario.matricula_aluno];
  const aluno = m?.aluno || null;

  const [documentos, comunicados, alertasProprios] = await Promise.all([
    db.collection('documentos').find({
      $or: [
        { 'destinatarios.escopo': 'institucional' },
        { 'destinatarios.escopo': 'turmas', 'destinatarios.turma_ids': aluno?.turma_id },
        { 'destinatarios.escopo': 'alunos', 'destinatarios.matriculas': usuario.matricula_aluno },
      ],
    }).sort({ data: -1 }).limit(6).toArray(),
    db.collection('comunicados').find({
      status: 'publicado',
      $or: [
        { 'destinatarios.escopo': 'institucional' },
        { 'destinatarios.escopo': 'turmas', 'destinatarios.turma_ids': aluno?.turma_id },
        { 'destinatarios.escopo': 'alunos', 'destinatarios.matriculas': usuario.matricula_aluno },
      ],
    }).sort({ data_publicacao: -1 }).limit(6).toArray(),
    Promise.resolve([]), // alunos não têm acesso a alertas internos
  ]);

  const evolucao = m?.evolucao || [];
  const ultimaVariacao = evolucao.filter((e) => e.variacao != null).slice(-1)[0]?.variacao ?? null;

  return {
    escopo: 'aluno',
    metricas: {
      mediaGeral: m?.media ?? null,
      frequenciaMedia: m?.freqPct ?? null,
      faltas: m?.totalFaltas ?? 0,
      totalAulas: m?.totalAulas ?? 0,
      documentos: documentos.length,
      comunicadosNaoLidos: comunicados.filter((c) => !(c.leituras || []).some((l) => l.matricula === usuario.matricula_aluno)).length,
      variacaoDesempenho: ultimaVariacao,
    },
    turma: m?.turma?.nome || null,
    aluno: aluno?.nome || null,
    evolucao,
    documentosRecentes: documentos.map(({ _id, fileId, ...d }) => ({ ...d, fileId: fileId?.toString?.() })),
    comunicadosRecentes: comunicados.map(({ _id, ...c }) => ({ id: c.id, titulo: c.titulo, data_publicacao: c.data_publicacao })),
    alertas: alertasProprios,
  };
}
