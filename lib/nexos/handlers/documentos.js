import { GridFSBucket, ObjectId } from 'mongodb';
import { ApiError, requirePerfil, ehEquipe } from '@/lib/nexos/auth';
import { proximoId } from '@/lib/nexos/metrics';
import { registrarAuditoria } from '@/lib/nexos/security';

const TAMANHO_MAXIMO = 10 * 1024 * 1024; // 10 MB
const TIPOS_PERMITIDOS = new Set([
  'application/pdf', 'text/plain', 'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/png', 'image/jpeg', 'image/webp',
]);

export function podeAcessarDocumento(usuario, doc) {
  const dest = doc?.destinatarios || {};
  if (dest.escopo === 'institucional') return true;
  if (usuario.perfil === 'ALUNO') {
    if (dest.escopo === 'alunos' && (dest.matriculas || []).includes(usuario.matricula_aluno)) return true;
    if (dest.escopo === 'turmas' && (dest.turma_ids || []).includes(Number(usuario.turma_id))) return true;
    return false;
  }
  if (usuario.perfil === 'PROFESSOR') {
    if (doc.publicado_por === usuario.id) return true;
    if (dest.escopo === 'alunos') {
      return (usuario.turmas || []).length > 0; // restrito a alunos das próprias turmas (validado no servidor abaixo)
    }
    if (dest.escopo === 'turmas') {
      return (dest.turma_ids || []).some((t) => (usuario.turmas || []).includes(Number(t)));
    }
    return false;
  }
  return true; // ADMIN / COORDENADOR
}

/**
 * Validação fina para professores: documento direcionado a alunos só é visível
 * se todos os alunos-alvo forem de turmas do professor.
 */
async function professorPodeVerAlunosDestino(db, usuario, doc) {
  const dest = doc.destinatarios || {};
  if (dest.escopo !== 'alunos') return true;
  if (!dest.matriculas?.length) return false;
  const alunos = await db.collection('alunos').find({ matricula: { $in: dest.matriculas } }).toArray();
  const turmasProfessor = usuario.turmas || [];
  return alunos.every((a) => turmasProfessor.includes(Number(a.turma_id)));
}

export async function listarDocumentos(db, usuario, query) {
  const q = String(query.get('q') || '').toLowerCase().trim();
  const categoria = query.get('categoria');
  const [todos, alunos] = await Promise.all([
    db.collection('documentos').find({}).sort({ data: -1 }).toArray(),
    db.collection('alunos').find({}).toArray(),
  ]);
  const matriculaParaTurma = Object.fromEntries(alunos.map((a) => [a.matricula, a.turma_id]));
  const visiveis = [];
  for (const doc of todos) {
    if (!podeAcessarDocumento(usuario, doc)) continue;
    if (usuario.perfil === 'PROFESSOR' && !(await professorPodeVerAlunosDestino(db, usuario, doc))) continue;
    const dest = doc.destinatarios || {};
    let escopo = dest.escopo || 'institucional';
    if (usuario.perfil === 'ALUNO' && dest.escopo === 'turmas' && (dest.turma_ids || []).length > 1) {
      escopo = `turmas (${dest.turma_ids.length})`;
    }
    visiveis.push({
      ...doc,
      _id: undefined,
      fileId: doc.fileId?.toString?.(),
      tamanho: doc.tamanho,
      destinatarios_resumo: escopo === 'institucional' ? 'Instituição'
        : escopo === 'turmas' ? `${(dest.turma_ids || []).length} turma(s)`
        : `${(dest.matriculas || []).length} aluno(s)`,
    });
  }
  let items = visiveis;
  if (q) {
    items = items.filter((d) =>
      (d.nome || '').toLowerCase().includes(q) ||
      (d.descricao || '').toLowerCase().includes(q)
    );
  }
  if (categoria) items = items.filter((d) => d.categoria === categoria);
  return {
    items,
    categorias: [...new Set(visiveis.map((d) => d.categoria).filter(Boolean))],
    pode_publicar: ehEquipe(usuario),
  };
}

export async function publicarDocumento(db, usuario, request) {
  requirePerfil(usuario, ['ADMIN', 'COORDENADOR', 'PROFESSOR']);
  let form;
  try {
    form = await request.formData();
  } catch {
    throw new ApiError(400, 'Envie o arquivo como multipart/form-data.');
  }
  const arquivo = form.get('arquivo');
  const nome = String(form.get('nome') || '').trim();
  const descricao = String(form.get('descricao') || '').trim();
  const categoria = String(form.get('categoria') || '').trim() || 'Geral';
  const escopo = String(form.get('escopo') || '');
  const turmaIds = (form.get('turma_ids') || '').toString().split(',').map(Number).filter((n) => Number.isFinite(n) && n > 0);
  const matriculas = (form.get('matriculas') || '').toString().split(',').map((s) => s.trim()).filter(Boolean);

  if (!(arquivo instanceof File)) throw new ApiError(400, 'Arquivo é obrigatório.');
  if (!nome) throw new ApiError(400, 'Nome do documento é obrigatório.');
  if (arquivo.size > TAMANHO_MAXIMO) throw new ApiError(400, 'Arquivo excede o limite de 10 MB.');
  if (!TIPOS_PERMITIDOS.has(arquivo.type)) {
    throw new ApiError(400, `Tipo de arquivo não permitido (${arquivo.type || 'desconhecido'}).`);
  }
  if (!['institucional', 'turmas', 'alunos'].includes(escopo)) {
    throw new ApiError(400, 'Escopo de compartilhamento inválido.');
  }
  if (escopo === 'institucional') requirePerfil(usuario, ['ADMIN', 'COORDENADOR']);

  const destinatarios = { escopo, turma_ids: [], matriculas: [] };

  if (escopo === 'turmas') {
    if (!turmaIds.length) throw new ApiError(400, 'Selecione ao menos uma turma.');
    if (usuario.perfil === 'PROFESSOR') {
      const naoAutorizadas = turmaIds.filter((t) => !(usuario.turmas || []).includes(t));
      if (naoAutorizadas.length) {
        throw new ApiError(403, 'Você só pode compartilhar com as turmas às quais está vinculado.');
      }
    }
    const existentes = await db.collection('turmas').find({ id: { $in: turmaIds } }).toArray();
    if (existentes.length !== turmaIds.length) throw new ApiError(400, 'Uma ou mais turmas não existem.');
    destinatarios.turma_ids = turmaIds;
  }
  if (escopo === 'alunos') {
    if (!matriculas.length) throw new ApiError(400, 'Selecione ao menos um aluno.');
    const alunos = await db.collection('alunos').find({ matricula: { $in: matriculas } }).toArray();
    if (alunos.length !== matriculas.length) throw new ApiError(400, 'Uma ou mais matrículas não existem.');
    if (usuario.perfil === 'PROFESSOR') {
      const fora = alunos.filter((a) => !(usuario.turmas || []).includes(Number(a.turma_id)));
      if (fora.length) {
        throw new ApiError(403, 'Você só pode compartilhar com alunos das suas turmas.');
      }
    }
    destinatarios.matriculas = matriculas;
  }

  // Persistência no GridFS (MongoDB) — não usa o filesystem efêmero do servidor
  const bucket = new GridFSBucket(db, { bucketName: 'documentos_arquivos' });
  const bytes = Buffer.from(await arquivo.arrayBuffer());
  const fileId = await new Promise((resolve, reject) => {
    const upload = bucket.openUploadStream(arquivo.name || 'documento', {
      contentType: arquivo.type,
      metadata: { publicado_por: usuario.id },
    });
    upload.on('error', reject);
    upload.on('finish', () => resolve(upload.id));
    upload.end(bytes);
  });

  const doc = {
    id: await proximoId(db, 'documentos'),
    nome: nome.slice(0, 150),
    descricao: descricao.slice(0, 1000),
    categoria: categoria.slice(0, 60),
    nome_arquivo: arquivo.name?.slice(0, 200) || 'documento',
    tipo_arquivo: arquivo.type,
    tamanho: arquivo.size,
    fileId,
    publicado_por: usuario.id,
    publicado_nome: usuario.nome,
    destinatarios,
    data: new Date().toISOString(),
  };
  await db.collection('documentos').insertOne(doc);
  await db.collection('atividades').insertOne({
    id: await proximoId(db, 'atividades'),
    tipo: 'documento',
    descricao: `${usuario.nome} compartilhou o documento "${doc.nome}".`,
    data: doc.data,
  });
  await registrarAuditoria(db, usuario, 'publicar_documento', 'documentos', { nome: doc.nome, escopo });
  return { documento: { ...doc, _id: undefined, fileId: fileId.toString() } };
}

export async function baixarDocumento(db, usuario, id) {
  const doc = await db.collection('documentos').findOne({ id: Number(id) });
  if (!doc) throw new ApiError(404, 'Documento não encontrado.');
  if (!podeAcessarDocumento(usuario, doc)) {
    throw new ApiError(403, 'Você não tem acesso a este documento.');
  }
  if (usuario.perfil === 'PROFESSOR' && !(await professorPodeVerAlunosDestino(db, usuario, doc))) {
    throw new ApiError(403, 'Você não tem acesso a este documento.');
  }
  const bucket = new GridFSBucket(db, { bucketName: 'documentos_arquivos' });
  const download = bucket.openDownloadStream(new ObjectId(doc.fileId));
  return { doc, download };
}

export async function excluirDocumento(db, usuario, id) {
  requirePerfil(usuario, ['ADMIN', 'COORDENADOR', 'PROFESSOR']);
  const doc = await db.collection('documentos').findOne({ id: Number(id) });
  if (!doc) throw new ApiError(404, 'Documento não encontrado.');
  if (usuario.perfil === 'PROFESSOR' && doc.publicado_por !== usuario.id) {
    throw new ApiError(403, 'Professores podem excluir apenas documentos que publicaram.');
  }
  const bucket = new GridFSBucket(db, { bucketName: 'documentos_arquivos' });
  try {
    await bucket.delete(new ObjectId(doc.fileId));
  } catch {
    // arquivo pode já ter sido removido
  }
  await db.collection('documentos').deleteOne({ id: doc.id });
  await registrarAuditoria(db, usuario, 'excluir_documento', 'documentos', { nome: doc.nome });
  return { ok: true };
}
