import { ApiError, requirePerfil, ehEquipe, podeVerAlertasInternos } from '@/lib/nexos/auth';
import { sincronizarAlertasAutomaticos, proximoId } from '@/lib/nexos/metrics';
import { registrarAuditoria } from '@/lib/nexos/security';

function filtrarAlertasVisiveis(usuario, alunoMap) {
  return (al) => {
    if (usuario.perfil === 'PROFESSOR') {
      const a = alunoMap[al.matricula_aluno];
      return a && (usuario.turmas || []).includes(Number(a.turma_id));
    }
    return true; // ADMIN/COORDENADOR (alunos não chegam aqui)
  };
}

export async function listarAlertas(db, usuario, query) {
  requirePerfil(usuario, ['ADMIN', 'COORDENADOR', 'PROFESSOR']);
  const [alertas, alunos, turmas] = await Promise.all([
    db.collection('alertas').find({}).sort({ data: -1 }).toArray(),
    db.collection('alunos').find({}).toArray(),
    db.collection('turmas').find({}).toArray(),
  ]);
  const alunoMap = Object.fromEntries(alunos.map((a) => [a.matricula, a]));
  const turmaMap = Object.fromEntries(turmas.map((t) => [t.id, t.nome]));
  const visivel = filtrarAlertasVisiveis(usuario, alunoMap);

  const filtros = {
    tipo: query.get('tipo'),
    prioridade: query.get('prioridade'),
    status: query.get('status'),
    categoria: query.get('categoria'),
    turma_id: parseInt(query.get('turma_id'), 10),
    q: String(query.get('q') || '').toLowerCase().trim(),
  };

  let items = alertas.filter(visivel).map((al) => {
    const a = alunoMap[al.matricula_aluno];
    return { ...al, _id: undefined, aluno_nome: a?.nome || '—', turma: turmaMap[a?.turma_id] || '—', turma_id: a?.turma_id ?? null };
  });
  if (filtros.tipo) items = items.filter((a) => a.tipo === filtros.tipo);
  if (filtros.prioridade) items = items.filter((a) => a.prioridade === filtros.prioridade);
  if (filtros.status) items = items.filter((a) => a.status === filtros.status);
  if (filtros.categoria) items = items.filter((a) => (a.categoria || 'automatico') === filtros.categoria);
  if (!Number.isNaN(filtros.turma_id)) items = items.filter((a) => a.turma_id === filtros.turma_id);
  if (filtros.q) {
    items = items.filter((a) =>
      a.aluno_nome.toLowerCase().includes(filtros.q) ||
      (a.descricao || '').toLowerCase().includes(filtros.q)
    );
  }
  return {
    items,
    resumo: {
      abertos: items.filter((a) => a.status === 'aberto').length,
      porPrioridade: { alta: items.filter((a) => a.prioridade === 'alta').length, media: items.filter((a) => a.prioridade === 'media').length, baixa: items.filter((a) => a.prioridade === 'baixa').length },
      porTipo: { frequencia: items.filter((a) => a.tipo === 'frequencia').length, desempenho: items.filter((a) => a.tipo === 'desempenho').length, manual: items.filter((a) => a.tipo === 'manual').length },
    },
  };
}

export async function atualizarAlerta(db, usuario, id, body) {
  requirePerfil(usuario, ['ADMIN', 'COORDENADOR', 'PROFESSOR']);
  const alerta = await db.collection('alertas').findOne({ id: Number(id) });
  if (!alerta) throw new ApiError(404, 'Alerta não encontrado.');
  // Professor só pode atualizar alertas de alunos de suas turmas
  if (usuario.perfil === 'PROFESSOR') {
    const aluno = await db.collection('alunos').findOne({ matricula: alerta.matricula_aluno });
    if (!aluno || !(usuario.turmas || []).includes(Number(aluno.turma_id))) {
      throw new ApiError(403, 'Você não tem permissão sobre este alerta.');
    }
  }
  const status = body?.status;
  if (!['aberto', 'resolvido'].includes(status)) throw new ApiError(400, 'Status inválido.');
  const set = { status };
  if (status === 'resolvido') set.data_resolucao = new Date().toISOString();
  else delete set.data_resolucao;
  await db.collection('alertas').updateOne({ id: alerta.id }, { $set: set });
  await registrarAuditoria(db, usuario, 'atualizar_alerta', 'alertas', { id: alerta.id, status });
  return { ok: true };
}

export async function criarAlertaManual(db, usuario, body) {
  requirePerfil(usuario, ['ADMIN', 'COORDENADOR', 'PROFESSOR']);
  const { matricula_aluno, tipo, prioridade, descricao, categoria } = body || {};
  const aluno = await db.collection('alunos').findOne({ matricula: matricula_aluno });
  if (!aluno) throw new ApiError(404, 'Aluno não encontrado.');
  if (usuario.perfil === 'PROFESSOR' && !(usuario.turmas || []).includes(Number(aluno.turma_id))) {
    throw new ApiError(403, 'Você não tem permissão sobre este aluno.');
  }
  if (typeof descricao !== 'string' || !descricao.trim()) throw new ApiError(400, 'Descrição é obrigatória.');
  if (!['alta', 'media', 'baixa'].includes(prioridade)) throw new ApiError(400, 'Prioridade inválida.');
  const categoriaValida = ['comportamento', 'social', 'saude', 'outros'].includes(categoria) ? categoria : 'outros';
  const alerta = {
    id: await proximoId(db, 'alertas'),
    matricula_aluno: aluno.matricula,
    tipo: 'manual',
    categoria: categoriaValida,
    prioridade,
    descricao: descricao.trim().slice(0, 500),
    data: new Date().toISOString(),
    status: 'aberto',
    auto: false,
    criado_por: usuario.id,
  };
  await db.collection('alertas').insertOne(alerta);
  await registrarAuditoria(db, usuario, 'criar_alerta_manual', 'alertas', { matricula: aluno.matricula, prioridade });
  return { alerta };
}

export async function regenerarAlertas(db, usuario) {
  requirePerfil(usuario, ['ADMIN', 'COORDENADOR']);
  const r = await sincronizarAlertasAutomaticos(db);
  await registrarAuditoria(db, usuario, 'regenerar_alertas', 'alertas', r);
  return r;
}
