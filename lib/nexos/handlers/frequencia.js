import { ApiError, requirePerfil, podeGerenciarTurma, ehEquipe } from '@/lib/nexos/auth';
import { sincronizarAlertasAutomaticos, proximoId } from '@/lib/nexos/metrics';
import { registrarAuditoria } from '@/lib/nexos/security';

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

function filtroFrequencia(usuario, query) {
  const filtro = {};
  if (usuario.perfil === 'PROFESSOR') {
    filtro.matricula_aluno = { $in: null }; // será substituído abaixo pelas turmas
  }
  if (usuario.perfil === 'ALUNO') filtro.matricula_aluno = usuario.matricula_aluno;
  const matricula = query.get('matricula');
  if (matricula) filtro.matricula_aluno = matricula;
  const dataInicio = query.get('data_inicio');
  const dataFim = query.get('data_fim');
  if (dataInicio || dataFim) {
    filtro.data_aula = {};
    if (dataInicio && DATA_RE.test(dataInicio)) filtro.data_aula.$gte = dataInicio;
    if (dataFim && DATA_RE.test(dataFim)) filtro.data_aula.$lte = dataFim;
  }
  return filtro;
}

export async function consultarFrequencia(db, usuario, query) {
  const turmaId = parseInt(query.get('turma_id'), 10);
  if (!Number.isNaN(turmaId) && usuario.perfil === 'PROFESSOR' && !podeGerenciarTurma(usuario, turmaId)) {
    throw new ApiError(403, 'Você não está vinculado a esta turma.');
  }

  const [alunos, registros] = await Promise.all([
    db.collection('alunos').find({}).toArray(),
    db.collection('frequencia').find({}).sort({ data_aula: -1 }).toArray(),
  ]);
  const alunoMap = Object.fromEntries(alunos.map((a) => [a.matricula, a]));

  let visiveis = registros;
  if (usuario.perfil === 'PROFESSOR') {
    visiveis = registros.filter((f) => {
      const a = alunoMap[f.matricula_aluno];
      return a && (usuario.turmas || []).includes(Number(a.turma_id));
    });
  } else if (usuario.perfil === 'ALUNO') {
    visiveis = registros.filter((f) => f.matricula_aluno === usuario.matricula_aluno);
  }

  if (!Number.isNaN(turmaId)) {
    visiveis = visiveis.filter((f) => alunoMap[f.matricula_aluno]?.turma_id === turmaId);
  }
  const matricula = query.get('matricula');
  if (matricula) visiveis = visiveis.filter((f) => f.matricula_aluno === matricula);
  const dataInicio = query.get('data_inicio');
  const dataFim = query.get('data_fim');
  if (dataInicio && DATA_RE.test(dataInicio)) visiveis = visiveis.filter((f) => f.data_aula >= dataInicio);
  if (dataFim && DATA_RE.test(dataFim)) visiveis = visiveis.filter((f) => f.data_aula <= dataFim);

  const limite = Math.min(parseInt(query.get('limite'), 10) || 500, 2000);
  return { items: visiveis.slice(0, limite).map(({ _id, ...f }) => f), total: visiveis.length };
}

export async function resumoFrequencia(db, usuario, query) {
  const turmaId = parseInt(query.get('turma_id'), 10);
  const escopo = ehEquipe(usuario);

  let filtroAlunos = {};
  if (usuario.perfil === 'PROFESSOR') {
    if (!Number.isNaN(turmaId) && !podeGerenciarTurma(usuario, turmaId)) {
      throw new ApiError(403, 'Você não está vinculado a esta turma.');
    }
    filtroAlunos = Number.isNaN(turmaId)
      ? { turma_id: { $in: usuario.turmas || [] } }
      : { turma_id: turmaId };
  } else if (usuario.perfil === 'ALUNO') {
    filtroAlunos = { matricula: usuario.matricula_aluno };
  } else if (!Number.isNaN(turmaId)) {
    filtroAlunos = { turma_id: turmaId };
  }

  const [alunos, registros] = await Promise.all([
    db.collection('alunos').find(filtroAlunos).toArray(),
    db.collection('frequencia').find({}).toArray(),
  ]);
  const porAluno = {};
  for (const f of registros) (porAluno[f.matricula_aluno] ||= []).push(f);

  const items = alunos.map((a) => {
    const fa = porAluno[a.matricula] || [];
    const presentes = fa.filter((f) => f.presente).length;
    const faltas = fa.length - presentes;
    const justificadas = fa.filter((f) => !f.presente && f.justificativa).length;
    return {
      matricula: a.matricula,
      nome: a.nome,
      turma_id: a.turma_id,
      totalAulas: fa.length,
      presentes,
      faltas,
      faltasJustificadas: justificadas,
      percentual: fa.length ? Math.round((presentes / fa.length) * 1000) / 10 : null,
    };
  }).sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR'));
  return { items, escopo };
}

/**
 * Registro de frequência em lote (turma + data).
 * Upsert por (matricula, data, disciplina) para evitar duplicatas.
 */
export async function registrarFrequencia(db, usuario, body) {
  requirePerfil(usuario, ['ADMIN', 'COORDENADOR', 'PROFESSOR']);
  const { turma_id, data_aula, disciplina_id, registros } = body || {};
  const turmaId = Number(turma_id);
  if (!turmaId) throw new ApiError(400, 'Turma é obrigatória.');
  if (!podeGerenciarTurma(usuario, turmaId)) {
    throw new ApiError(403, 'Você não pode registrar frequência nesta turma.');
  }
  if (typeof data_aula !== 'string' || !DATA_RE.test(data_aula)) {
    throw new ApiError(400, 'Data da aula inválida (formato AAAA-MM-DD).');
  }
  if (data_aula > new Date().toISOString().slice(0, 10)) {
    throw new ApiError(400, 'Não é possível registrar frequência para datas futuras.');
  }
  if (!Array.isArray(registros) || !registros.length) {
    throw new ApiError(400, 'Nenhum registro de frequência enviado.');
  }

  const alunosTurma = await db.collection('alunos').find({ turma_id: turmaId }).toArray();
  const matriculasTurma = new Set(alunosTurma.map((a) => a.matricula));
  const discId = Number(disciplina_id) || null;

  let salvos = 0;
  const agora = new Date().toISOString();
  for (const r of registros) {
    const matricula = r?.matricula_aluno;
    if (!matriculasTurma.has(matricula)) continue; // ignora alunos fora da turma
    const presente = !!r.presente;
    const justificativa = !presente && typeof r.justificativa === 'string' && r.justificativa.trim()
      ? r.justificativa.trim().slice(0, 300)
      : null;
    const filtro = { matricula_aluno: matricula, data_aula, disciplina_id: discId };
    await db.collection('frequencia').updateOne(filtro, {
      $set: {
        ...filtro,
        turma_id: turmaId,
        presente,
        justificativa,
        registrado_por: usuario.id,
        registrado_em: agora,
      },
      $setOnInsert: { id: Date.now() + Math.floor(Math.random() * 1000) },
    }, { upsert: true });
    salvos++;
  }

  await db.collection('atividades').insertOne({
    id: await proximoId(db, 'atividades'),
    tipo: 'presenca',
    descricao: `${usuario.nome} registrou frequência (${data_aula}).`,
    data: agora,
  });
  await registrarAuditoria(db, usuario, 'registrar_frequencia', 'frequencia', { turma: turmaId, data: data_aula, registros: salvos });
  await sincronizarAlertasAutomaticos(db, { filtroAlunos: { turma_id: turmaId } });
  return { salvos };
}
