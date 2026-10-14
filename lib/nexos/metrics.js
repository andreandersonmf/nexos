// Cálculos centralizados do Nexo's — usados por dashboard, desempenho, frequência,
// alertas, relatórios e Nexo IA para garantir consistência entre os módulos.

export function mediaDe(valores) {
  const v = valores.filter((x) => typeof x === 'number' && !Number.isNaN(x));
  if (!v.length) return null;
  return Math.round((v.reduce((s, x) => s + x, 0) / v.length) * 10) / 10;
}

export function arredondar(v, casas = 1) {
  if (v == null || Number.isNaN(v)) return null;
  return Math.round(v * 10 ** casas) / 10 ** casas;
}

export function frequenciaPct(registros) {
  if (!registros?.length) return null; // sem registros ≠ 100%
  const presentes = registros.filter((f) => f.presente).length;
  return Math.round((presentes / registros.length) * 1000) / 10;
}

export function mediaGeralAluno(notas) {
  if (!notas?.length) return null;
  return mediaDe(notas.map((n) => n.valor));
}

export function mediaPorDisciplina(notas) {
  const porDisc = {};
  for (const n of notas) {
    const chave = n.disciplina_id ?? n.disciplina_nome;
    (porDisc[chave] ||= []).push(n.valor);
  }
  return Object.entries(porDisc).map(([chave, valores]) => ({
    chave: Number.isNaN(Number(chave)) ? chave : Number(chave),
    media: mediaDe(valores),
    total: valores.length,
  }));
}

/**
 * Evolução por bimestre: média geral do aluno em cada bimestre e variação vs. anterior.
 */
export function evolucaoPorBimestre(notas) {
  const porBim = {};
  for (const n of notas) {
    const b = Number(n.bimestre);
    if (!b) continue;
    (porBim[b] ||= []).push(n.valor);
  }
  const bims = Object.keys(porBim).map(Number).sort((a, b) => a - b);
  return bims.map((bim, i) => {
    const media = mediaDe(porBim[bim]);
    const anterior = i > 0 ? mediaDe(porBim[bims[i - 1]]) : null;
    return {
      bimestre: bim,
      media,
      variacao: media != null && anterior != null ? arredondar(media - anterior) : null,
    };
  });
}

/**
 * Regras oficiais de alertas (frequência e desempenho).
 * Retorna lista de {tipo, prioridade, descricao} aplicáveis.
 */
export function regrasAlertas(media, freqPct) {
  const alertas = [];
  if (freqPct != null) {
    if (freqPct < 75) {
      alertas.push({ tipo: 'frequencia', prioridade: 'alta', descricao: `Frequência abaixo de 75% (${String(freqPct).replace('.', ',')}%).` });
    } else if (freqPct < 85) {
      alertas.push({ tipo: 'frequencia', prioridade: 'media', descricao: `Frequência em alerta (${String(freqPct).replace('.', ',')}%).` });
    }
  }
  if (media != null) {
    if (media < 5) {
      alertas.push({ tipo: 'desempenho', prioridade: 'alta', descricao: `Média geral baixa (${String(media).replace('.', ',')}).` });
    } else if (media < 6) {
      alertas.push({ tipo: 'desempenho', prioridade: 'media', descricao: `Média abaixo de 6,0 (${String(media).replace('.', ',')}).` });
    } else if (media < 7) {
      alertas.push({ tipo: 'desempenho', prioridade: 'baixa', descricao: `Nota média levemente abaixo do esperado (${String(media).replace('.', ',')}).` });
    }
  }
  return alertas;
}

/**
 * Calcula métricas consolidadas por aluno (média, frequência, evolução, faltas).
 * Aceita filtros de alunos/notas/frequência para limitar o escopo.
 */
export async function calcularMetricasAlunos(db, { filtroAlunos = {}, filtroNotas = {}, filtroFrequencia = {} } = {}) {
  const [alunos, notas, frequencia, turmas] = await Promise.all([
    db.collection('alunos').find(filtroAlunos).toArray(),
    db.collection('notas').find(filtroNotas).toArray(),
    db.collection('frequencia').find(filtroFrequencia).toArray(),
    db.collection('turmas').find({}).toArray(),
  ]);
  const turmaMap = Object.fromEntries(turmas.map((t) => [t.id, t]));
  const notasPorAluno = {};
  const freqPorAluno = {};
  for (const n of notas) (notasPorAluno[n.matricula_aluno] ||= []).push(n);
  for (const f of frequencia) (freqPorAluno[f.matricula_aluno] ||= []).push(f);

  const byAluno = {};
  for (const a of alunos) {
    const na = notasPorAluno[a.matricula] || [];
    const fa = freqPorAluno[a.matricula] || [];
    const media = mediaGeralAluno(na);
    const freq = frequenciaPct(fa);
    byAluno[a.matricula] = {
      aluno: a,
      turma: turmaMap[a.turma_id] || null,
      media,
      freqPct: freq,
      totalNotas: na.length,
      totalAulas: fa.length,
      totalFaltas: fa.filter((f) => !f.presente).length,
      evolucao: evolucaoPorBimestre(na),
      alertasRegra: regrasAlertas(media, freq),
    };
  }
  return { alunos, notas, frequencia, turmas, byAluno, turmaMap };
}

/**
 * Sincroniza alertas automáticos sem apagar os manuais nem duplicar.
 * Alertas automáticos cuja condição deixou de valer são marcados como resolvidos (histórico preservado).
 */
export async function sincronizarAlertasAutomaticos(db, { filtroAlunos = {}, filtroNotas = {}, filtroFrequencia = {} } = {}) {
  const { byAluno } = await calcularMetricasAlunos(db, { filtroAlunos, filtroNotas, filtroFrequencia });
  const now = new Date().toISOString();
  const chavesAtivas = new Set();
  const matriculasNoEscopo = new Set(Object.keys(byAluno));
  let criados = 0, atualizados = 0, resolvidos = 0;

  for (const matricula of Object.keys(byAluno)) {
    const m = byAluno[matricula];
    for (const regra of m.alertasRegra) {
      const chave = `${matricula}|${regra.tipo}`;
      chavesAtivas.add(chave);
      const existente = await db.collection('alertas').findOne({ chave });
      if (existente) {
        if (existente.descricao !== regra.descricao || existente.prioridade !== regra.prioridade) {
          await db.collection('alertas').updateOne({ chave }, {
            $set: {
              descricao: regra.descricao,
              prioridade: regra.prioridade,
              data_atualizacao: now,
              status: 'aberto',
            },
          });
          atualizados++;
        }
      } else {
        await db.collection('alertas').insertOne({
          id: await proximoId(db, 'alertas'),
          chave,
          matricula_aluno: matricula,
          tipo: regra.tipo,
          prioridade: regra.prioridade,
          descricao: regra.descricao,
          data: now,
          status: 'aberto',
          auto: true,
        });
        criados++;
      }
    }
  }

  // Fecha alertas automáticos cuja condição não se aplica mais (apenas alunos do escopo avaliado)
  const filtroResolucao = Object.keys(filtroAlunos).length
    ? { auto: true, status: 'aberto', matricula_aluno: { $in: [...matriculasNoEscopo] } }
    : { auto: true, status: 'aberto' };
  const abertos = await db.collection('alertas').find(filtroResolucao).toArray();
  for (const al of abertos) {
    const chave = al.chave || `${al.matricula_aluno}|${al.tipo}`;
    if (!chavesAtivas.has(chave)) {
      await db.collection('alertas').updateOne(
        { _id: al._id },
        { $set: { status: 'resolvido', data_resolucao: now } }
      );
      resolvidos++;
    }
  }

  return { criados, atualizados, resolvidos };
}

/**
 * Gera ids numéricos sequenciais por coleção usando um contador atômico.
 * Quando o contador não existe, inicia a partir do maior id já presente
 * na coleção (bancos legados ou sem seed de contadores).
 */
export async function proximoId(db, collection) {
  const r = await db.collection('contadores').findOneAndUpdate(
    { _id: collection },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after', includeResultMetadata: true }
  );
  const seq = r.value?.seq ?? (r?.seq ?? 1);
  if (r.lastErrorObject && !r.lastErrorObject.updatedExisting) {
    const maior = await db.collection(collection)
      .find({ id: { $type: 'number' } })
      .sort({ id: -1 })
      .limit(1)
      .toArray();
    const maxId = maior[0]?.id ?? 0;
    if (maxId >= seq) {
      await db.collection('contadores').updateOne({ _id: collection }, { $set: { seq: maxId + 1 } });
      return maxId + 1;
    }
  }
  return seq;
}

export async function anoLetivoAtual(db) {
  const cfg = await db.collection('configuracoes').findOne({ chave: 'ano_letivo' });
  const ano = parseInt(cfg?.valor, 10);
  if (!Number.isNaN(ano)) return ano;
  return new Date().getFullYear();
}
