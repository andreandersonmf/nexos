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
  const llmKey = process.env.EMERGENT_LLM_KEY?.trim();
  if (!llmKey || llmKey === 'sk-emergent-COLE_AQUI_SUA_CHAVE') {
    console.error('[Nexo IA] EMERGENT_LLM_KEY ausente ou ainda com valor de exemplo.');
    throw new ApiError(503, 'A Nexo IA ainda não está configurada no servidor. Verifique a variável EMERGENT_LLM_KEY nas configurações de ambiente da Vercel.');
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

  let chatSession;
  try {
    // LlmChat do emergentintegrations aceita chave Emergent (sk-emergent-*),
    // não uma chave direta do Google Gemini.
    if (!llmKey.startsWith('sk-emergent-')) {
      console.error('[Nexo IA] EMERGENT_LLM_KEY possui formato incompatível com emergentintegrations.');
      throw new ApiError(503, 'A variável EMERGENT_LLM_KEY precisa conter uma chave Universal da Emergent (prefixo sk-emergent-). Uma chave direta do Google Gemini não funciona nesta integração.');
    }
    chatSession = new LlmChat(llmKey, sessionId, systemPrompt, historico)
      .withModel('gemini', MODEL)
      .withParams({ temperature: 0.3, max_tokens: 1500 })
      .withTools(ferramentas);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    console.error('[Nexo IA] Falha ao inicializar o cliente LLM:', err?.stack || err?.message || err);
    throw new ApiError(502, 'Não foi possível inicializar a integração da Nexo IA. Confira o formato da chave EMERGENT_LLM_KEY e o nome do modelo GEMINI_MODEL.');
  }

  // Fazemos a chamada com ferramentas e preservamos a resposta final retornada
  // pelo SDK. A versão anterior descartava essa resposta e iniciava um segundo
  // stream sem uma nova mensagem, causando falhas/desvios no fluxo.
  let resposta;
  try {
    resposta = await chatSession.sendMessageWithTools(new UserMessage({ text: message }));
    let iteracao = 0;
    while (Array.isArray(resposta?.tool_calls) && resposta.tool_calls.length && iteracao < MAX_ITERACOES_FERRAMENTAS) {
      for (const tc of resposta.tool_calls) {
        let resultado;
        try {
          resultado = await executarFerramenta(db, usuario, tc.name, tc.arguments || {});
        } catch (e) {
          resultado = { erro: e instanceof ApiError ? e.message : 'não foi possível concluir a consulta' };
        }
        chatSession.addToolResult(tc.id, JSON.stringify(resultado).slice(0, 20000));
      }
      resposta = await chatSession.sendMessageWithTools();
      iteracao += 1;
    }
    if (Array.isArray(resposta?.tool_calls) && resposta.tool_calls.length) {
      console.warn('[Nexo IA] Limite de iterações de ferramentas atingido.');
    }
  } catch (err) {
    const status = Number(err?.status || err?.statusCode || err?.response?.status);
    const detalhe = String(err?.message || 'erro sem mensagem').slice(0, 500);
    console.error('[Nexo IA] Falha na chamada ao provedor:', { status: Number.isFinite(status) ? status : null, message: detalhe, stack: err?.stack });
    if (status === 401 || status === 403) {
      throw new ApiError(502, 'O serviço de IA recusou a autenticação. Confirme se EMERGENT_LLM_KEY é uma chave Universal válida e ativa da Emergent, e não uma chave do Google AI Studio.');
    }
    if (status === 400 || status === 404) {
      throw new ApiError(502, `O serviço de IA rejeitou a solicitação ou o modelo “${MODEL}”. Confira GEMINI_MODEL nas variáveis da Vercel. Código retornado: ${status}.`);
    }
    throw new ApiError(502, 'A Nexo IA não conseguiu concluir a consulta ao provedor. O motivo técnico foi registrado nos logs da função da Vercel; consulte a mensagem [Nexo IA] Falha na chamada ao provedor.');
  }

  // Mantém compatibilidade com o frontend SSE. A resposta já foi obtida acima;
  // dividimos o texto em pequenos deltas sem disparar uma segunda chamada ao modelo.
  const encoder = new TextEncoder();
  const respostaFinal = String(resposta?.content || '').trim() || 'Desculpe, não consegui gerar uma resposta. Tente reformular a pergunta.';
  const stream = new ReadableStream({
    async start(controller) {
      const send = (value) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(value)}\n\n`));
      try {
        send({ conversaId });
        for (let i = 0; i < respostaFinal.length; i += 48) {
          send({ delta: respostaFinal.slice(i, i + 48) });
        }
        await salvarMensagens(db, usuario, conversaId,
          [...(conversa.mensagens || []), { role: 'user', content: message }, { role: 'assistant', content: respostaFinal }].slice(-MAX_MENSAGENS_HISTORICO),
          conversa.titulo);
        send({ done: true, reply: respostaFinal });
      } catch (err) {
        console.error('[Nexo IA] Erro ao salvar/transmitir resposta:', err?.stack || err?.message || err);
        send({ error: 'A resposta foi gerada, mas não foi possível salvá-la. Tente novamente.' });
      } finally {
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
