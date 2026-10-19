import { ApiError, requirePerfil, ehEquipe } from '@/lib/nexos/auth';
import { proximoId } from '@/lib/nexos/metrics';
import { registrarAuditoria } from '@/lib/nexos/security';

function podeVerComunicado(usuario, com) {
  const dest = com.destinatarios || {};
  if (dest.escopo === 'institucional') return true;
  if (['ALUNO', 'RESPONSAVEL'].includes(usuario.perfil)) {
    if (dest.escopo === 'alunos' && (dest.matriculas || []).includes(usuario.matricula_aluno)) return true;
    if (dest.escopo === 'turmas' && (dest.turma_ids || []).includes(Number(usuario.turma_id))) return true;
    return false;
  }
  if (usuario.perfil === 'PROFESSOR') {
    if (com.publicado_por === usuario.id) return true;
    if (dest.escopo === 'turmas') return (dest.turma_ids || []).some((t) => (usuario.turmas || []).includes(Number(t)));
    if (dest.escopo === 'alunos') return false;
    return false;
  }
  return true; // ADMIN / COORDENADOR
}

async function validarDestinatarios(db, usuario, escopo, turmaIds, matriculas) {
  const destinatarios = { escopo, turma_ids: [], matriculas: [] };
  if (escopo === 'institucional') {
    requirePerfil(usuario, ['ADMIN', 'COORDENADOR']);
    return destinatarios;
  }
  if (escopo === 'turmas') {
    if (!turmaIds?.length) throw new ApiError(400, 'Selecione ao menos uma turma.');
    if (usuario.perfil === 'PROFESSOR') {
      const naoAutorizadas = turmaIds.filter((t) => !(usuario.turmas || []).includes(Number(t)));
      if (naoAutorizadas.length) {
        throw new ApiError(403, 'Você só pode publicar comunicados para turmas às quais está vinculado.');
      }
    }
    const existentes = await db.collection('turmas').find({ id: { $in: turmaIds.map(Number) } }).toArray();
    if (existentes.length !== turmaIds.length) throw new ApiError(400, 'Uma ou mais turmas não existem.');
    destinatarios.turma_ids = turmaIds.map(Number);
    return destinatarios;
  }
  if (escopo === 'alunos') {
    if (!matriculas?.length) throw new ApiError(400, 'Selecione ao menos um aluno.');
    const alunos = await db.collection('alunos').find({ matricula: { $in: matriculas } }).toArray();
    if (alunos.length !== matriculas.length) throw new ApiError(400, 'Uma ou mais matrículas não existem.');
    if (usuario.perfil === 'PROFESSOR') {
      const fora = alunos.filter((a) => !(usuario.turmas || []).includes(Number(a.turma_id)));
      if (fora.length) {
        throw new ApiError(403, 'Você só pode enviar comunicados para alunos das suas turmas.');
      }
    }
    destinatarios.matriculas = matriculas;
    return destinatarios;
  }
  throw new ApiError(400, 'Escopo de destinatários inválido.');
}

export async function listarComunicados(db, usuario, query) {
  // Alunos só enxergam comunicados publicados — nunca rascunhos
  const status = ['ALUNO', 'RESPONSAVEL'].includes(usuario.perfil) ? 'publicado' : (query.get('status') || 'publicado');
  const todos = await db.collection('comunicados').find({}).sort({ data_publicacao: -1, criado_em: -1 }).toArray();
  const visiveis = todos.filter((c) => podeVerComunicado(usuario, c));
  const items = visiveis
    .filter((c) => status === 'todos' || c.status === status)
    .map((c) => {
      const leitura = ['ALUNO', 'RESPONSAVEL'].includes(usuario.perfil)
        ? (c.leituras || []).find((l) => l.matricula === usuario.matricula_aluno)
        : null;
      const dest = c.destinatarios || {};
      return {
        ...c,
        _id: undefined,
        lido: !!leitura,
        data_leitura: leitura?.data || null,
        destinatarios_resumo: dest.escopo === 'institucional' ? 'Toda a instituição'
          : dest.escopo === 'turmas' ? `${(dest.turma_ids || []).length} turma(s)`
          : `${(dest.matriculas || []).length} aluno(s)`,
        total_leituras: (c.leituras || []).length,
      };
    });
  return { items, pode_publicar: ehEquipe(usuario) };
}

export async function criarComunicado(db, usuario, body) {
  requirePerfil(usuario, ['ADMIN', 'COORDENADOR', 'PROFESSOR']);
  const { titulo, conteudo, escopo, turma_ids, matriculas, status } = body || {};
  if (typeof titulo !== 'string' || !titulo.trim()) throw new ApiError(400, 'Título é obrigatório.');
  if (typeof conteudo !== 'string' || !conteudo.trim()) throw new ApiError(400, 'Conteúdo é obrigatório.');
  const destinatarios = await validarDestinatarios(db, usuario, escopo, turma_ids, matriculas);
  const statusFinal = status === 'rascunho' ? 'rascunho' : 'publicado';

  const com = {
    id: await proximoId(db, 'comunicados'),
    titulo: titulo.trim().slice(0, 150),
    conteudo: conteudo.trim().slice(0, 8000),
    destinatarios,
    status: statusFinal,
    publicado_por: usuario.id,
    publicado_nome: usuario.nome,
    criado_em: new Date().toISOString(),
    data_publicacao: statusFinal === 'publicado' ? new Date().toISOString() : null,
    leituras: [],
  };
  await db.collection('comunicados').insertOne(com);
  await registrarAuditoria(db, usuario, 'criar_comunicado', 'comunicados', { titulo: com.titulo, status: statusFinal });
  return { comunicado: { ...com, _id: undefined } };
}

export async function atualizarComunicado(db, usuario, id, body) {
  requirePerfil(usuario, ['ADMIN', 'COORDENADOR', 'PROFESSOR']);
  const com = await db.collection('comunicados').findOne({ id: Number(id) });
  if (!com) throw new ApiError(404, 'Comunicado não encontrado.');
  if (usuario.perfil === 'PROFESSOR' && com.publicado_por !== usuario.id) {
    throw new ApiError(403, 'Professores podem editar apenas os próprios comunicados.');
  }
  const { titulo, conteudo, status, escopo, turma_ids, matriculas } = body || {};
  const set = {};
  if (titulo !== undefined) {
    if (typeof titulo !== 'string' || !titulo.trim()) throw new ApiError(400, 'Título inválido.');
    set.titulo = titulo.trim().slice(0, 150);
  }
  if (conteudo !== undefined) {
    if (typeof conteudo !== 'string' || !conteudo.trim()) throw new ApiError(400, 'Conteúdo inválido.');
    set.conteudo = conteudo.trim().slice(0, 8000);
  }
  if (escopo !== undefined) {
    set.destinatarios = await validarDestinatarios(db, usuario, escopo, turma_ids, matriculas);
  }
  if (status !== undefined) {
    if (!['rascunho', 'publicado'].includes(status)) throw new ApiError(400, 'Status inválido.');
    set.status = status;
    if (status === 'publicado' && !com.data_publicacao) set.data_publicacao = new Date().toISOString();
  }
  if (Object.keys(set).length) {
    await db.collection('comunicados').updateOne({ id: com.id }, { $set: set });
  }
  await registrarAuditoria(db, usuario, 'atualizar_comunicado', 'comunicados', { id: com.id, campos: Object.keys(set) });
  const atualizado = await db.collection('comunicados').findOne({ id: com.id });
  return { comunicado: { ...atualizado, _id: undefined } };
}

export async function excluirComunicado(db, usuario, id) {
  requirePerfil(usuario, ['ADMIN', 'COORDENADOR', 'PROFESSOR']);
  const com = await db.collection('comunicados').findOne({ id: Number(id) });
  if (!com) throw new ApiError(404, 'Comunicado não encontrado.');
  if (usuario.perfil === 'PROFESSOR' && com.publicado_por !== usuario.id) {
    throw new ApiError(403, 'Professores podem excluir apenas os próprios comunicados.');
  }
  await db.collection('comunicados').deleteOne({ id: com.id });
  await registrarAuditoria(db, usuario, 'excluir_comunicado', 'comunicados', { id: com.id });
  return { ok: true };
}

export async function marcarLeitura(db, usuario, id) {
  const com = await db.collection('comunicados').findOne({ id: Number(id) });
  if (!com) throw new ApiError(404, 'Comunicado não encontrado.');
  if (!['ALUNO', 'RESPONSAVEL'].includes(usuario.perfil)) throw new ApiError(400, 'Apenas aluno ou responsável vinculado pode registrar leitura.');
  if (!podeVerComunicado(usuario, com)) {
    throw new ApiError(403, 'Este comunicado não foi destinado a você.');
  }
  const jaLeu = (com.leituras || []).some((l) => l.matricula === usuario.matricula_aluno);
  if (!jaLeu) {
    await db.collection('comunicados').updateOne(
      { id: com.id },
      { $push: { leituras: { matricula: usuario.matricula_aluno, data: new Date().toISOString() } } }
    );
  }
  return { ok: true };
}
