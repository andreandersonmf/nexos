import { LlmChat, UserMessage } from 'emergentintegrations';
import { ApiError } from '@/lib/nexos/auth';
import { proximoId } from '@/lib/nexos/metrics';
import { ferramentasDoPerfil, executarFerramenta, systemPromptPara } from './nexo-ia';

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const MAX_MENSAGENS_HISTORICO = 24;
const MAX_ITERACOES_FERRAMENTAS = 2;

// ============ Histórico persistido (por usuário autenticado) ============

export async function obterHistorico(db, usuario, query) {
  const conversaId = parseInt(query.get('conversa_id'), 10);
  if (!Number.isNaN(conversaId)) {
    const conversa = await db.collection('nexo_chats').findOne({ id: conversaId, usuario_id: usuario.id });
    if (!conversa) throw new ApiError(404, 'Conversa não encontrada.');
    return {
      conversa: {
        id: conversa.id,
        titulo: conversa.titulo,
        mensagens: conversa.mensagens,
        criado_em: conversa.criado_em,
        atualizado_em: conversa.atualizado_em,
      },
    };
  }
  const conversas = await db.collection('nexo_chats')
    .find({ usuario_id: usuario.id })
    .sort({ atualizado_em: -1 })
    .limit(15)
    .toArray();
  return {
    conversas: conversas.map((c) => ({
      id: c.id,
      titulo: c.titulo,
      criado_em: c.criado_em,
      atualizado_em: c.atualizado_em,
      total_mensagens: c.mensagens.length,
    })),
  };
}

export async function novaConversa(db, usuario) {
  const conversa = {
    id: await proximoId(db, 'nexo_chats'),
    usuario_id: usuario.id,
    titulo: 'Nova conversa',
    mensagens: [],
    criado_em: new Date().toISOString(),
    atualizado_em: new Date().toISOString(),
  };
  await db.collection('nexo_chats').insertOne(conversa);
  return { id: conversa.id };
}

async function salvarMensagens(db, usuario, conversaId, mensagens, tituloAtual) {
  const titulo = tituloAtual || mensagens[0]?.content?.slice(0, 60) || 'Nova conversa';
  await db.collection('nexo_chats').updateOne(
    { id: conversaId, usuario_id: usuario.id },
    { $set: { mensagens, titulo, atualizado_em: new Date().toISOString() } }
  );
}

// ============ Chat com ferramentas ============

export async function chat(db, request, usuario, body) {
  if (!process.env.EMERGENT_LLM_KEY) {
    throw new ApiError(500, 'EMERGENT_LLM_KEY não configurada.');
  }
  const message = typeof body?.message === 'string' ? body.message.trim().slice(0, 4000) : '';
  if (!message) throw new ApiError(400, 'Mensagem obrigatória.');

  let conversaId = parseInt(body?.conversaId, 10);
  if (Number.isNaN(conversaId)) {
    const nova = await novaConversa(db, usuario);
    conversaId = nova.id;
  }
  const conversa = await db.collection('nexo_chats').findOne({ id: conversaId, usuario_id: usuario.id });
  if (!conversa) throw new ApiError(404, 'Conversa não encontrada.');

  const historico = (conversa.mensagens || [])
    .slice(-MAX_MENSAGENS_HISTORICO)
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m) => ({ role: m.role, content: m.content.slice(0, 8000) }));

  const systemPrompt = systemPromptPara(usuario.perfil, usuario.nome || 'usuário');
  const ferramentas = ferramentasDoPerfil(usuario.perfil);
  const sessionId = `nexos-${usuario.id}-${conversaId}`;

  const chatSession = new LlmChat(process.env.EMERGENT_LLM_KEY, sessionId, systemPrompt, historico)
    .withModel('gemini', MODEL)
    .withParams({ temperature: 0.3, max_tokens: 1500 })
    .withTools(ferramentas);

  // 1) Primeira chamada — modelo pode pedir ferramentas
  const primeira = await chatSession.sendMessageWithTools(new UserMessage({ text: message }));

  // 2) Executa as ferramentas solicitadas (escopo validado no servidor)
  const toolCalls = primeira.tool_calls || [];
  for (let iteracao = 0; iteracao < MAX_ITERACOES_FERRAMENTAS && toolCalls.length; iteracao++) {
    for (const tc of toolCalls) {
      let resultado;
      try {
        resultado = await executarFerramenta(db, usuario, tc.name, tc.arguments || {});
      } catch (e) {
        resultado = { erro: e instanceof ApiError ? e.message : 'não foi possível concluir a consulta' };
      }
      chatSession.addToolResult(tc.id, JSON.stringify(resultado).slice(0, 20000));
    }
    const proxima = await chatSession.sendMessageWithTools();
    toolCalls.length = 0;
    toolCalls.push(...(proxima.tool_calls || []));
  }

  // 3) Resposta final em streaming
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (value) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(value)}\n\n`));
      try {
        send({ conversaId });
        let full = '';
        for await (const event of chatSession.streamMessage()) {
          if (event?.type === 'text_delta' && typeof event.content === 'string') {
            full += event.content;
            send({ delta: event.content });
          } else if (event?.type === 'stream_done') {
            full = event.content || full;
          }
        }
        const respostaFinal = (full || '').trim() || 'Desculpe, não consegui gerar uma resposta.';
        await salvarMensagens(db, usuario, conversaId,
          [...(conversa.mensagens || []), { role: 'user', content: message }, { role: 'assistant', content: respostaFinal }].slice(-MAX_MENSAGENS_HISTORICO),
          conversa.titulo);
        send({ done: true, reply: respostaFinal });
        controller.close();
      } catch (err) {
        console.error('Nexo IA stream error:', err?.message);
        await salvarMensagens(db, usuario, conversaId,
          [...(conversa.mensagens || []), { role: 'user', content: message }].slice(-MAX_MENSAGENS_HISTORICO),
          conversa.titulo);
        send({ error: 'Falha ao gerar resposta. Tente novamente.' });
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
