import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { ensureSeed, resetSeed } from '@/lib/nexos/seed-data';
import { LlmChat, UserMessage } from 'emergentintegrations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

function json(data, status = 200) {
  return NextResponse.json(data, { status });
}

// ============== HELPERS ==============
async function computeAlunoMetrics(db) {
  const [alunos, turmas, notas, frequencia] = await Promise.all([
    db.collection('alunos').find({}).toArray(),
    db.collection('turmas').find({}).toArray(),
    db.collection('notas').find({}).toArray(),
    db.collection('frequencia').find({}).toArray(),
  ]);
  const turmaMap = Object.fromEntries(turmas.map((t) => [t.id, t]));
  const byAluno = {};
  for (const a of alunos) {
    const na = notas.filter((n) => n.matricula_aluno === a.matricula);
    const fa = frequencia.filter((f) => f.matricula_aluno === a.matricula);
    const media = na.length ? Math.round((na.reduce((s, n) => s + n.valor, 0) / na.length) * 10) / 10 : null;
    const presentes = fa.filter((f) => f.presente).length;
    const freqPct = fa.length ? Math.round((presentes / fa.length) * 100) : 0;
    byAluno[a.matricula] = {
      aluno: a,
      turma: turmaMap[a.turma_id],
      media,
      freqPct,
      totalNotas: na.length,
      totalFaltas: fa.length - presentes,
    };
  }
  return { alunos, turmas, byAluno, turmaMap };
}

async function regenerarAlertas(db) {
  // apagar alertas automaticos (todos no MVP)
  await db.collection('alertas').deleteMany({});
  const { byAluno } = await computeAlunoMetrics(db);
  const novos = [];
  let id = 1;
  const now = new Date().toISOString();
  for (const matricula of Object.keys(byAluno)) {
    const m = byAluno[matricula];
    // frequencia
    if (m.freqPct > 0 && m.freqPct < 75) {
      novos.push({
        id: id++, matricula_aluno: matricula, tipo: 'frequencia', prioridade: 'alta',
        descricao: `Frequência abaixo de 75% (${m.freqPct}%).`, data: now, status: 'aberto', auto: true,
      });
    } else if (m.freqPct > 0 && m.freqPct < 85) {
      novos.push({
        id: id++, matricula_aluno: matricula, tipo: 'frequencia', prioridade: 'media',
        descricao: `Frequência em alerta (${m.freqPct}%).`, data: now, status: 'aberto', auto: true,
      });
    }
    // desempenho
    if (m.media != null && m.media < 5) {
      novos.push({
        id: id++, matricula_aluno: matricula, tipo: 'desempenho', prioridade: 'alta',
        descricao: `Média geral baixa (${m.media.toFixed(1).replace('.', ',')}).`, data: now, status: 'aberto', auto: true,
      });
    } else if (m.media != null && m.media < 6) {
      novos.push({
        id: id++, matricula_aluno: matricula, tipo: 'desempenho', prioridade: 'media',
        descricao: `Média abaixo de 6,0 (${m.media.toFixed(1).replace('.', ',')}).`, data: now, status: 'aberto', auto: true,
      });
    } else if (m.media != null && m.media < 7) {
      novos.push({
        id: id++, matricula_aluno: matricula, tipo: 'desempenho', prioridade: 'baixa',
        descricao: `Nota média levemente abaixo do esperado (${m.media.toFixed(1).replace('.', ',')}).`, data: now, status: 'aberto', auto: true,
      });
    }
  }
  if (novos.length) await db.collection('alertas').insertMany(novos);
  return { gerados: novos.length };
}

async function routeHandler(request, context) {
  const resolvedParams = await context.params;
  const parts = resolvedParams?.path || [];
  const path = '/' + parts.join('/');
  const method = request.method;
  const url = new URL(request.url);

  try {
    await ensureSeed();
    const db = await getDb();

    if (path === '/' || path === '' || path === '/health') {
      return json({ ok: true, service: "Nexo's API", version: '0.2.0' });
    }

    if (path === '/seed/reset' && method === 'POST') {
      const r = await resetSeed();
      return json(r);
    }

    // ---------- AUTH ----------
    if (path === '/auth/login' && method === 'POST') {
      const body = await request.json();
      const { email, senha } = body || {};
      if (!email || !senha) return json({ error: 'E-mail e senha são obrigatórios.' }, 400);
      const user = await db.collection('usuarios').findOne({ email: email.toLowerCase().trim(), senha });
      if (!user) return json({ error: 'Credenciais inválidas.' }, 401);
      const { senha: _, _id, ...safe } = user;
      return json({ user: safe });
    }

    // ---------- DASHBOARD ----------
    if (path === '/dashboard' && method === 'GET') {
      const [totalAlunos, totalTurmas, totalProfessores, alertas, frequencia, atividades, alunos, turmas] = await Promise.all([
        db.collection('alunos').countDocuments(),
        db.collection('turmas').countDocuments(),
        db.collection('usuarios').countDocuments({ perfil: 'PROFESSOR' }),
        db.collection('alertas').find({ status: 'aberto' }).toArray(),
        db.collection('frequencia').find({}).toArray(),
        db.collection('atividades').find({}).sort({ data: -1 }).limit(5).toArray(),
        db.collection('alunos').find({}).toArray(),
        db.collection('turmas').find({}).toArray(),
      ]);

      const totalPresencas = frequencia.filter((f) => f.presente).length;
      const freqMedia = frequencia.length > 0 ? Math.round((totalPresencas / frequencia.length) * 100) : 0;

      const alunoTurma = Object.fromEntries(alunos.map((a) => [a.matricula, a.turma_id]));
      const turmaNome = Object.fromEntries(turmas.map((t) => [t.id, t.nome]));
      const porTurma = {};
      for (const f of frequencia) {
        const tid = alunoTurma[f.matricula_aluno];
        if (!tid) continue;
        if (!porTurma[tid]) porTurma[tid] = { total: 0, presentes: 0 };
        porTurma[tid].total += 1;
        if (f.presente) porTurma[tid].presentes += 1;
      }
      const frequenciaPorTurma = Object.entries(porTurma).map(([tid, v]) => ({
        turma: turmaNome[tid] || tid,
        percentual: v.total ? Math.round((v.presentes / v.total) * 100) : 0,
      })).sort((a, b) => a.turma.localeCompare(b.turma));

      const alunoMap = Object.fromEntries(alunos.map((a) => [a.matricula, a]));
      const prioOrdem = { alta: 0, media: 1, baixa: 2 };
      const alertasPrioritarios = alertas
        .sort((a, b) => (prioOrdem[a.prioridade] ?? 3) - (prioOrdem[b.prioridade] ?? 3))
        .slice(0, 5)
        .map((al) => {
          const a = alunoMap[al.matricula_aluno];
          return { ...al, _id: undefined, aluno_nome: a?.nome, turma: turmaNome[a?.turma_id] };
        });

      return json({
        metricas: {
          alunos: totalAlunos, turmas: totalTurmas, professores: totalProfessores,
          alertasAbertos: alertas.length, frequenciaMedia: freqMedia,
        },
        alertasPrioritarios,
        atividadesRecentes: atividades.map(({ _id, ...a }) => a),
        frequenciaPorTurma,
      });
    }

    // ---------- ALUNOS LIST ----------
    if (path === '/alunos' && method === 'GET') {
      const q = (url.searchParams.get('q') || '').toLowerCase().trim();
      const [alunos, turmas] = await Promise.all([
        db.collection('alunos').find({}).toArray(),
        db.collection('turmas').find({}).toArray(),
      ]);
      const turmaMap = Object.fromEntries(turmas.map((t) => [t.id, t.nome]));
      let items = alunos.map((a) => ({
        matricula: a.matricula, nome: a.nome,
        turma: turmaMap[a.turma_id] || '—', status: a.status || 'ATIVO',
      }));
      if (q) {
        items = items.filter((a) =>
          a.nome.toLowerCase().includes(q) ||
          a.matricula.toLowerCase().includes(q) ||
          a.turma.toLowerCase().includes(q)
        );
      }
      items.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
      return json({ items });
    }

    // ---------- ALUNO DETAIL ----------
    if (path.startsWith('/alunos/') && method === 'GET' && parts.length === 2) {
      const matricula = parts[1];
      const aluno = await db.collection('alunos').findOne({ matricula });
      if (!aluno) return json({ error: 'Aluno não encontrado.' }, 404);
      const [turma, notas, frequencia, observacoes, responsaveis, disciplinas, alertas] = await Promise.all([
        db.collection('turmas').findOne({ id: aluno.turma_id }),
        db.collection('notas').find({ matricula_aluno: matricula }).toArray(),
        db.collection('frequencia').find({ matricula_aluno: matricula }).toArray(),
        db.collection('observacoes').find({ matricula_aluno: matricula }).sort({ data: -1 }).toArray(),
        db.collection('responsaveis').find({ matricula_aluno: matricula }).toArray(),
        db.collection('disciplinas').find({}).toArray(),
        db.collection('alertas').find({ matricula_aluno: matricula, status: 'aberto' }).toArray(),
      ]);

      const totalPresencas = frequencia.filter((f) => f.presente).length;
      const faltas = frequencia.length - totalPresencas;
      const freqPercentual = frequencia.length > 0 ? Math.round((totalPresencas / frequencia.length) * 100) : 0;

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
      const notasPorDisc = {};
      for (const n of notas) {
        const nome = discMap[n.disciplina_id] || n.disciplina_nome;
        if (!notasPorDisc[nome]) notasPorDisc[nome] = [];
        notasPorDisc[nome].push(n);
      }
      const notasResumo = Object.entries(notasPorDisc).map(([disc, arr]) => ({
        disciplina: disc,
        media: Math.round((arr.reduce((s, n) => s + n.valor, 0) / arr.length) * 10) / 10,
        bimestres: arr.sort((a, b) => a.bimestre - b.bimestre).map((n) => ({ bimestre: n.bimestre, valor: n.valor })),
      }));

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

      return json({
        aluno: { ...aluno, _id: undefined, turma: turma?.nome },
        responsaveis: responsaveis.map(({ _id, ...r }) => r),
        notas: notasResumo,
        historico,
        frequencia: { percentual: freqPercentual, faltas, totalAulas: frequencia.length, chart: faltasChart },
        observacoes: observacoes.map(({ _id, ...o }) => o),
        alertas: alertas.map(({ _id, ...a }) => a),
      });
    }

    // ---------- TURMAS ----------
    if (path === '/turmas' && method === 'GET') {
      const [turmas, alunos] = await Promise.all([
        db.collection('turmas').find({}).sort({ nome: 1 }).toArray(),
        db.collection('alunos').find({}).toArray(),
      ]);
      const items = turmas.map((t) => ({
        ...t, _id: undefined,
        totalAlunos: alunos.filter((a) => a.turma_id === t.id).length,
      }));
      return json({ items });
    }

    if (path.startsWith('/turmas/') && method === 'GET' && parts.length === 2) {
      const tid = parseInt(parts[1]);
      const turma = await db.collection('turmas').findOne({ id: tid });
      if (!turma) return json({ error: 'Turma não encontrada.' }, 404);
      const { byAluno } = await computeAlunoMetrics(db);
      const alunosTurma = Object.values(byAluno).filter((m) => m.aluno.turma_id === tid);
      const alertas = await db.collection('alertas').find({ status: 'aberto' }).toArray();
      const alertasPorAluno = {};
      for (const al of alertas) {
        alertasPorAluno[al.matricula_aluno] = (alertasPorAluno[al.matricula_aluno] || 0) + 1;
      }
      const alunosList = alunosTurma.map(({ aluno, media, freqPct }) => ({
        matricula: aluno.matricula, nome: aluno.nome, media, freqPct,
        alertas: alertasPorAluno[aluno.matricula] || 0,
      })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
      const medias = alunosList.filter((a) => a.media != null).map((a) => a.media);
      const freqs = alunosList.map((a) => a.freqPct);
      const metricas = {
        totalAlunos: alunosList.length,
        mediaGeral: medias.length ? Math.round((medias.reduce((s, v) => s + v, 0) / medias.length) * 10) / 10 : null,
        freqMedia: freqs.length ? Math.round(freqs.reduce((s, v) => s + v, 0) / freqs.length) : 0,
        totalAlertas: alunosList.reduce((s, a) => s + a.alertas, 0),
      };
      return json({ turma: { ...turma, _id: undefined }, alunos: alunosList, metricas });
    }

    // ---------- DISCIPLINAS ----------
    if (path === '/disciplinas' && method === 'GET') {
      const items = await db.collection('disciplinas').find({}).sort({ nome: 1 }).toArray();
      return json({ items: items.map(({ _id, ...d }) => d) });
    }

    // ---------- NOTAS (list by filter) ----------
    if (path === '/notas' && method === 'GET') {
      const turma_id = parseInt(url.searchParams.get('turma_id'));
      const disciplina_id = parseInt(url.searchParams.get('disciplina_id'));
      const bimestre = parseInt(url.searchParams.get('bimestre'));
      if (!turma_id || !disciplina_id || !bimestre) {
        return json({ error: 'turma_id, disciplina_id e bimestre são obrigatórios.' }, 400);
      }
      const [alunos, notas, disciplina] = await Promise.all([
        db.collection('alunos').find({ turma_id }).sort({ nome: 1 }).toArray(),
        db.collection('notas').find({ disciplina_id, bimestre }).toArray(),
        db.collection('disciplinas').findOne({ id: disciplina_id }),
      ]);
      const notaMap = Object.fromEntries(notas.map((n) => [n.matricula_aluno, n.valor]));
      const items = alunos.map((a) => ({
        matricula: a.matricula, nome: a.nome,
        valor: notaMap[a.matricula] ?? null,
      }));
      return json({ items, disciplina: disciplina?.nome });
    }

    // ---------- NOTAS BATCH UPSERT ----------
    if (path === '/notas/batch' && method === 'POST') {
      const body = await request.json();
      const { turma_id, disciplina_id, bimestre, notas } = body || {};
      if (!turma_id || !disciplina_id || !bimestre || !Array.isArray(notas)) {
        return json({ error: 'Payload inválido.' }, 400);
      }
      const disciplina = await db.collection('disciplinas').findOne({ id: parseInt(disciplina_id) });
      let gravadas = 0, removidas = 0;
      for (const n of notas) {
        const matricula = n.matricula_aluno || n.matricula;
        if (!matricula) continue;
        const valor = n.valor;
        const filter = { matricula_aluno: matricula, disciplina_id: parseInt(disciplina_id), bimestre: parseInt(bimestre) };
        if (valor == null || valor === '' || isNaN(parseFloat(valor))) {
          const r = await db.collection('notas').deleteMany(filter);
          removidas += r.deletedCount;
          continue;
        }
        const v = Math.max(0, Math.min(10, Math.round(parseFloat(valor) * 10) / 10));
        await db.collection('notas').updateOne(filter, {
          $set: {
            ...filter, disciplina_nome: disciplina?.nome,
            valor: v, data_lancamento: new Date().toISOString(),
          },
          $setOnInsert: { id: Date.now() + Math.floor(Math.random() * 1000) },
        }, { upsert: true });
        gravadas++;
      }
      // registrar atividade
      await db.collection('atividades').insertOne({
        id: Date.now(),
        tipo: 'nota',
        descricao: `Notas de ${disciplina?.nome || 'disciplina'} publicadas (bimestre ${bimestre}).`,
        data: new Date().toISOString(),
      });
      // regenerar alertas automaticamente
      await regenerarAlertas(db);
      return json({ gravadas, removidas });
    }

    // ---------- ALERTAS ----------
    if (path === '/alertas' && method === 'GET') {
      const [alertas, alunos, turmas] = await Promise.all([
        db.collection('alertas').find({}).sort({ data: -1 }).toArray(),
        db.collection('alunos').find({}).toArray(),
        db.collection('turmas').find({}).toArray(),
      ]);
      const alunoMap = Object.fromEntries(alunos.map((a) => [a.matricula, a]));
      const turmaMap = Object.fromEntries(turmas.map((t) => [t.id, t.nome]));
      const items = alertas.map((al) => {
        const a = alunoMap[al.matricula_aluno];
        return { ...al, _id: undefined, aluno_nome: a?.nome || '—', turma: turmaMap[a?.turma_id] || '—' };
      });
      return json({ items });
    }

    if (path.startsWith('/alertas/') && method === 'PATCH' && parts.length === 2) {
      const id = parseInt(parts[1]);
      const body = await request.json();
      const r = await db.collection('alertas').updateOne({ id }, { $set: { status: body.status || 'resolvido' } });
      if (!r.matchedCount) return json({ error: 'Alerta não encontrado.' }, 404);
      return json({ ok: true });
    }

    if (path === '/alertas/regenerar' && method === 'POST') {
      const r = await regenerarAlertas(db);
      return json(r);
    }

    // ---------- NEXO IA ----------
    if (path === '/nexo-ia/chat' && method === 'POST') {
      if (!process.env.EMERGENT_LLM_KEY) {
        return json({ error: 'EMERGENT_LLM_KEY não configurada.' }, 500);
      }
      const body = await request.json();
      const message = typeof body.message === 'string' ? body.message.trim() : '';
      if (!message) return json({ error: 'Mensagem obrigatória.' }, 400);
      const sessionId = body.sessionId || `nexos-${Date.now()}`;
      const history = Array.isArray(body.history)
        ? body.history
            .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
            .slice(-20).map((m) => ({ role: m.role, content: m.content.slice(0, 8000) }))
        : [];
      const streamMode = url.searchParams.get('stream') === 'true';

      // snapshot escolar
      const { byAluno, turmas } = await computeAlunoMetrics(db);
      const alertas = await db.collection('alertas').find({ status: 'aberto' }).toArray();
      const resumoAlunos = Object.values(byAluno).map(({ aluno, turma, media, freqPct }) => ({
        matricula: aluno.matricula, nome: aluno.nome, turma: turma?.nome,
        mediaGeral: media, frequenciaPct: freqPct,
        alertas: alertas.filter((al) => al.matricula_aluno === aluno.matricula).map((al) => al.descricao),
      }));

      const systemPrompt = `Você é o "Nexo IA", assistente analítico do sistema Nexo's de gestão escolar.\n` +
        `Fale sempre em português do Brasil. Seja claro, objetivo e empático.\n` +
        `Use SOMENTE os dados fornecidos. Ao citar alunos, mencione nome e turma. Para riscos explique o motivo (freq<75%, média<6, alertas).\n` +
        `Formate listas com marcadores. Seja conciso.\n\n` +
        `DADOS DA ESCOLA (JSON):\n${JSON.stringify({ alunos: resumoAlunos, totalAlunos: resumoAlunos.length, totalTurmas: turmas.length, alertasAbertos: alertas.length }, null, 0)}`;

      const chat = new LlmChat(process.env.EMERGENT_LLM_KEY, sessionId, systemPrompt, history)
        .withModel('gemini', MODEL)
        .withParams({ temperature: 0.3, max_tokens: 1500 });

      const userMessage = new UserMessage({ text: message });

      if (!streamMode) {
        const reply = await chat.sendMessage(userMessage);
        return json({ sessionId, model: MODEL, reply });
      }

      // ---------- STREAMING SSE ----------
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const send = (value) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(value)}\n\n`));
          try {
            send({ sessionId, model: MODEL });
            let full = '';
            for await (const event of chat.streamMessage(userMessage)) {
              if (event?.type === 'text_delta' && typeof event.content === 'string') {
                full += event.content;
                send({ delta: event.content });
              } else if (event?.type === 'stream_done') {
                full = event.content || full;
              }
            }
            send({ done: true, reply: full });
            controller.close();
          } catch (err) {
            console.error('Gemini stream error:', err?.message);
            send({ error: 'Falha ao gerar resposta.' });
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          'X-Accel-Buffering': 'no',
          Connection: 'keep-alive',
        },
      });
    }

    return json({ error: `Rota não encontrada: ${method} ${path}` }, 404);
  } catch (error) {
    console.error('[API ERROR]', method, path, error);
    return json({ error: error?.message || 'Erro interno.' }, 500);
  }
}

export const GET = routeHandler;
export const POST = routeHandler;
export const PUT = routeHandler;
export const DELETE = routeHandler;
export const PATCH = routeHandler;
