import { ApiError, requirePerfil, podeAcessarAluno, podeVerObservacoes, ehEquipe } from '@/lib/nexos/auth';
import { mediaPorDisciplina, mediaGeralAluno, frequenciaPct, evolucaoPorBimestre, proximoId } from '@/lib/nexos/metrics';
import { registrarAuditoria } from '@/lib/nexos/security';

function filtroAlunosDoUsuario(usuario) {
  if (usuario.perfil === 'ADMIN' || usuario.perfil === 'COORDENADOR') return {};
  if (usuario.perfil === 'PROFESSOR') return { turma_id: { $in: usuario.turmas || [] } };
  if (usuario.perfil === 'ALUNO') return { matricula: usuario.matricula_aluno };
  return { matricula: '__nenhum__' };
}

export async function listarAlunos(db, usuario, query) {
  const q = String(query.get('q') || '').toLowerCase().trim().slice(0, 100);
  const turmaId = parseInt(query.get('turma_id'), 10);
  const [alunos, turmas] = await Promise.all([
    db.collection('alunos').find(filtroAlunosDoUsuario(usuario)).toArray(),
    db.collection('turmas').find({}).toArray(),
  ]);
  const turmaMap = Object.fromEntries(turmas.map((t) => [t.id, t.nome]));
  let items = alunos.map((a) => ({
    matricula: a.matricula,
    nome: a.nome,
    turma_id: a.turma_id,
    turma: turmaMap[a.turma_id] || '—',
    status: a.status || 'ATIVO',
    email: a.email || null,
  }));
  if (q) {
    items = items.filter((a) =>
      a.nome.toLowerCase().includes(q) ||
      a.matricula.toLowerCase().includes(q) ||
      a.turma.toLowerCase().includes(q)
    );
  }
  if (!Number.isNaN(turmaId)) items = items.filter((a) => a.turma_id === turmaId);
  items.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  return { items, turmas: turmas.map(({ _id, ...t }) => t) };
}

export async function criarAluno(db, usuario, body) {
  requirePerfil(usuario, ['ADMIN', 'COORDENADOR']);
  const { nome, matricula, turma_id, data_nascimento, email } = body || {};
  if (typeof nome !== 'string' || !nome.trim()) throw new ApiError(400, 'Nome é obrigatório.');
  if (typeof matricula !== 'string' || !matricula.trim()) throw new ApiError(400, 'Matrícula é obrigatória.');

  const matriculaLimpa = matricula.trim().slice(0, 40);
  const [existente, turma] = await Promise.all([
    db.collection('alunos').findOne({ matricula: matriculaLimpa }),
    db.collection('turmas').findOne({ id: Number(turma_id) }),
  ]);
  if (existente) throw new ApiError(409, 'Já existe um aluno com esta matrícula.');
  if (!turma) throw new ApiError(400, 'Turma informada não existe.');

  const aluno = {
    matricula: matriculaLimpa,
    nome: nome.trim(),
    turma_id: Number(turma_id),
    data_nascimento: data_nascimento || null,
    email: email?.trim() || null,
    status: 'ATIVO',
    criado_em: new Date().toISOString(),
  };
  await db.collection('alunos').insertOne(aluno);
  await db.collection('atividades').insertOne({
    id: await proximoId(db, 'atividades'),
    tipo: 'cadastro',
    descricao: `${usuario.nome} cadastrou o aluno ${aluno.nome}.`,
    data: new Date().toISOString(),
  });
  await registrarAuditoria(db, usuario, 'criar_aluno', 'alunos', { matricula: aluno.matricula });
  return { aluno };
}

export async function atualizarAluno(db, usuario, matricula, body) {
  requirePerfil(usuario, ['ADMIN', 'COORDENADOR']);
  const aluno = await db.collection('alunos').findOne({ matricula });
  if (!aluno) throw new ApiError(404, 'Aluno não encontrado.');

  const set = {};
  const { nome, turma_id, data_nascimento, email, status } = body || {};
  if (nome !== undefined) {
    if (typeof nome !== 'string' || !nome.trim()) throw new ApiError(400, 'Nome inválido.');
    set.nome = nome.trim();
  }
  if (turma_id !== undefined) {
    const turma = await db.collection('turmas').findOne({ id: Number(turma_id) });
    if (!turma) throw new ApiError(400, 'Turma informada não existe.');
    set.turma_id = Number(turma_id);
  }
  if (data_nascimento !== undefined) set.data_nascimento = data_nascimento || null;
  if (email !== undefined) set.email = email?.trim() || null;
  if (status !== undefined) {
    if (!['ATIVO', 'INATIVO', 'TRANSFERIDO'].includes(status)) throw new ApiError(400, 'Status inválido.');
    set.status = status;
  }
  if (Object.keys(set).length) {
    await db.collection('alunos').updateOne({ matricula }, { $set: set });
  }
  await registrarAuditoria(db, usuario, 'atualizar_aluno', 'alunos', { matricula, campos: Object.keys(set) });
  const atualizado = await db.collection('alunos').findOne({ matricula });
  return { aluno: { ...atualizado, _id: undefined } };
}

export async function detalharAluno(db, usuario, matricula) {
  const aluno = await db.collection('alunos').findOne({ matricula });
  if (!aluno) throw new ApiError(404, 'Aluno não encontrado.');
  if (!podeAcessarAluno(usuario, aluno)) {
    throw new ApiError(403, 'Você não tem permissão para acessar este aluno.');
  }

  const [turma, notas, frequencia, observacoes, responsaveis, disciplinas, alertas] = await Promise.all([
    db.collection('turmas').findOne({ id: aluno.turma_id }),
    db.collection('notas').find({ matricula_aluno: matricula }).toArray(),
    db.collection('frequencia').find({ matricula_aluno: matricula }).toArray(),
    podeVerObservacoes(usuario)
      ? db.collection('observacoes').find({ matricula_aluno: matricula }).sort({ data: -1 }).toArray()
      : Promise.resolve([]),
    ehEquipe(usuario)
      ? db.collection('responsaveis').find({ matricula_aluno: matricula }).toArray()
      : Promise.resolve([]),
    db.collection('disciplinas').find({}).toArray(),
    ehEquipe(usuario)
      ? db.collection('alertas').find({ matricula_aluno: matricula, status: 'aberto' }).toArray()
      : Promise.resolve([]),
  ]);

  const freq = frequenciaPct(frequencia);
  const faltas = frequencia.filter((f) => !f.presente).length;

  const faltasPorMes = {};
  const nomesMes = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  for (const f of frequencia) {
    if (f.presente) continue;
    const d = new Date(f.data_aula);
    const k = `${d.getFullYear()}-${d.getMonth()}`;
    faltasPorMes[k] = (faltasPorMes[k] || 0) + 1;
  }
  const faltasChart = Object.entries(faltasPorMes)
    .map(([k, v]) => {
      const [y, m] = k.split('-');
      return { mes: nomesMes[parseInt(m)], ano: parseInt(y), faltas: v, _sort: parseInt(y) * 12 + parseInt(m) };
    })
    .sort((a, b) => a._sort - b._sort).slice(-6)
    .map(({ _sort, ...rest }) => rest);

  const discMap = Object.fromEntries(disciplinas.map((d) => [d.id, d.nome]));
  const notasResumo = mediaPorDisciplina(notas).map(({ chave, media, total }) => {
    const nome = discMap[chave] || chave;
    const daDisc = notas.filter((n) => (n.disciplina_id ?? n.disciplina_nome) === chave || discMap[n.disciplina_id] === nome);
    return {
      disciplina: typeof nome === 'string' ? nome : String(nome),
      media,
      total,
      bimestres: daDisc.sort((a, b) => a.bimestre - b.bimestre).map((n) => ({ bimestre: n.bimestre, valor: n.valor })),
    };
  });

  const bimestres = [...new Set(notas.map((n) => n.bimestre))].sort();
  const historico = bimestres.map((bim) => {
    const row = { bimestre: `${bim}º Bimestre` };
    let soma = 0, qtd = 0;
    for (const d of disciplinas) {
      const n = notas.find((x) => x.bimestre === bim && x.disciplina_id === d.id);
      row[d.nome] = n ? n.valor : null;
      if (n) { soma += n.valor; qtd++; }
    }
    row['Média'] = qtd ? Math.round((soma / qtd) * 10) / 10 : null;
    return row;
  });

  const evolucao = evolucaoPorBimestre(notas);

  // Documentos compartilhados com este aluno (visíveis ao requisitante)
  const documentos = await db.collection('documentos').find({
    $or: [
      { 'destinatarios.escopo': 'institucional' },
      { 'destinatarios.escopo': 'turmas', 'destinatarios.turma_ids': aluno.turma_id },
      { 'destinatarios.escopo': 'alunos', 'destinatarios.matriculas': matricula },
    ],
  }).sort({ data: -1 }).toArray();

  return {
    aluno: { ...aluno, _id: undefined, turma: turma?.nome, turma_id: aluno.turma_id },
    responsaveis: responsaveis.map(({ _id, ...r }) => r),
    notas: notasResumo,
    historico,
    evolucao,
    frequencia: {
      percentual: freq, // null quando não há registros
      faltas,
      totalAulas: frequencia.length,
      chart: faltasChart,
    },
    observacoes: observacoes.map(({ _id, ...o }) => o),
    alertas: alertas.map(({ _id, ...a }) => a),
    documentos: documentos.map(({ _id, fileId, ...d }) => ({ ...d, fileId: fileId?.toString?.() })),
  };
}
