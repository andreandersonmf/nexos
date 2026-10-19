import { ApiError } from '@/lib/nexos/auth';
import { proximoId } from '@/lib/nexos/metrics';
import { ferramentasDoPerfil, executarFerramenta, systemPromptPara } from './nexo-ia';

const MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.6-flash';
const MAX_RETRIES_503 = 2;
const MAX_MENSAGENS_HISTORICO = 24;
const MAX_ITERACOES_FERRAMENTAS = 2;
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

function converterFerramentasParaGemini(ferramentas) {
  return ferramentas.map((item) => item.function).filter(Boolean).map((fn) => ({
    name: fn.name,
    description: fn.description,
    parameters: fn.parameters || { type: 'object', properties: {} },
  }));
}

class GeminiProviderError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'GeminiProviderError';
    this.httpStatus = status;
    this.providerCode = code || null;
  }
}

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function erroPublicoGemini(status) {
  if (status === 400 || status === 404) return new ApiError(502, `O Google Gemini rejeitou a solicitação ou o modelo “${MODEL}”. Confira GEMINI_MODEL e o acesso ao modelo no Google AI Studio. Código: ${status}.`);
  if (status === 401 || status === 403) return new ApiError(502, 'O Google Gemini recusou o acesso. Confira se GEMINI_API_KEY é uma chave válida e se o projeto Google tem acesso à Gemini API.');
  if (status === 429) return new ApiError(502, 'O limite de solicitações ou de uso da Gemini API foi atingido. Confira as cotas e o faturamento do projeto Google.');
  if (status >= 500) return new ApiError(502, 'A Gemini API está temporariamente indisponível. Tente novamente em alguns instantes.');
  return new ApiError(502, 'Não foi possível concluir a solicitação ao Google Gemini. Consulte os logs da função da Vercel.');
}

async function chamarGemini(apiKey, contents, systemPrompt, ferramentas, model = MODEL) {
  const endpoint = `${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent`;
  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents,
        ...(ferramentas.length ? { tools: [{ functionDeclarations: ferramentas }] } : {}),
        generationConfig: { temperature: 0.3, maxOutputTokens: 1500 },
      }),
      cache: 'no-store',
    });
  } catch (err) {
    console.error('[Nexo IA] Falha de rede ao chamar Google Gemini:', err?.message || err);
    throw new ApiError(502, 'Não foi possível conectar ao Google Gemini. Tente novamente em alguns instantes.');
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const providerMessage = String(payload?.error?.message || response.statusText || 'erro sem mensagem').slice(0, 400);
    const providerCode = payload?.error?.status || null;
    console.error('[Nexo IA] Google Gemini respondeu com erro:', { model, status: response.status, code: providerCode, message: providerMessage });
    throw new GeminiProviderError(response.status, providerCode, providerMessage);
  }
  const candidate = payload?.candidates?.[0];
  if (!candidate?.content?.parts) {
    const reason = candidate?.finishReason || payload?.promptFeedback?.blockReason || 'resposta vazia';
    console.warn('[Nexo IA] Google Gemini não retornou conteúdo utilizável:', reason);
    throw new ApiError(502, 'O Google Gemini não retornou uma resposta utilizável. Tente reformular a pergunta.');
  }
  return candidate.content;
}


async function chamarGeminiComRetry(apiKey, contents, systemPrompt, ferramentas, model, maxRetries = MAX_RETRIES_503) {
  let attempt = 0;
  while (true) {
    try {
      return await chamarGemini(apiKey, contents, systemPrompt, ferramentas, model);
    } catch (err) {
      if (!(err instanceof GeminiProviderError) || err.httpStatus !== 503 || attempt >= maxRetries) {
        throw err;
      }
      const waitMs = 700 * (2 ** attempt);
      attempt += 1;
      console.warn(`[Nexo IA] Gemini ${model} retornou 503; nova tentativa ${attempt}/${maxRetries} em ${waitMs} ms.`);
      await esperar(waitMs);
    }
  }
}

async function chamarGeminiComFallback(apiKey, contents, systemPrompt, ferramentas) {
  try {
    return await chamarGeminiComRetry(apiKey, contents, systemPrompt, ferramentas, MODEL);
  } catch (err) {
    if (!(err instanceof GeminiProviderError) || err.httpStatus !== 503 || !FALLBACK_MODEL || FALLBACK_MODEL === MODEL) {
      if (err instanceof GeminiProviderError) throw erroPublicoGemini(err.httpStatus);
      throw err;
    }
    console.warn(`[Nexo IA] Modelo principal ${MODEL} continua indisponível; tentando modelo alternativo ${FALLBACK_MODEL}.`);
    try {
      return await chamarGeminiComRetry(apiKey, contents, systemPrompt, ferramentas, FALLBACK_MODEL, 1);
    } catch (fallbackErr) {
      if (fallbackErr instanceof GeminiProviderError) throw erroPublicoGemini(fallbackErr.httpStatus);
      throw fallbackErr;
    }
  }
}

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

// ============ Chat com ferramentas usando a API oficial do Google Gemini ============

export async function chat(db, request, usuario, body) {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'COLE_AQUI_SUA_CHAVE_DO_GOOGLE') {
    console.error('[Nexo IA] GEMINI_API_KEY ausente ou ainda com valor de exemplo.');
    throw new ApiError(503, 'A Nexo IA ainda não está configurada. Cadastre GEMINI_API_KEY nas variáveis de ambiente da Vercel.');
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
    .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content.slice(0, 8000) }] }));

  const systemPrompt = systemPromptPara(usuario.perfil, usuario.nome || 'usuário');
  const ferramentas = converterFerramentasParaGemini(ferramentasDoPerfil(usuario.perfil));
  const contents = [...historico, { role: 'user', parts: [{ text: message }] }];
  let respostaFinal = '';
  let iteracao = 0;

  try {
    while (iteracao <= MAX_ITERACOES_FERRAMENTAS) {
      const respostaModelo = await chamarGeminiComFallback(apiKey, contents, systemPrompt, ferramentas);
      const parts = respostaModelo.parts || [];
      const chamadas = parts.filter((part) => part.functionCall?.name);
      if (!chamadas.length) {
        respostaFinal = parts.map((part) => part.text || '').join('').trim();
        break;
      }

      contents.push(respostaModelo);
      const respostasFerramentas = [];
      for (const part of chamadas) {
        const call = part.functionCall;
        let resultado;
        try {
          resultado = await executarFerramenta(db, usuario, call.name, call.args || {});
        } catch (err) {
          resultado = { erro: err instanceof ApiError ? err.message : 'Não foi possível concluir a consulta.' };
        }
        respostasFerramentas.push({ functionResponse: { name: call.name, response: { result: resultado ?? null } } });
      }
      contents.push({ role: 'user', parts: respostasFerramentas });
      iteracao += 1;
    }
  } catch (err) {
    if (err instanceof ApiError) throw err;
    console.error('[Nexo IA] Erro inesperado no fluxo Gemini:', err?.stack || err?.message || err);
    throw new ApiError(502, 'A Nexo IA não conseguiu concluir a consulta ao Google Gemini. Consulte os logs da função da Vercel.');
  }

  if (!respostaFinal) respostaFinal = 'Não consegui concluir a consulta com os dados disponíveis. Tente reformular a pergunta.';

  // Mantém compatibilidade com o frontend SSE existente sem alterar a interface.
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (value) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(value)}\n\n`));
      try {
        send({ conversaId });
        for (let i = 0; i < respostaFinal.length; i += 48) send({ delta: respostaFinal.slice(i, i + 48) });
        await salvarMensagens(db, usuario, conversaId,
          [...(conversa.mensagens || []), { role: 'user', content: message }, { role: 'assistant', content: respostaFinal }].slice(-MAX_MENSAGENS_HISTORICO),
          conversa.titulo);
        send({ done: true, reply: respostaFinal });
      } catch (err) {
        console.error('[Nexo IA] Erro ao salvar/transmitir resposta:', err?.stack || err?.message || err);
        send({ error: 'A resposta foi gerada, mas não foi possível salvá-la. Tente novamente.' });
      } finally { controller.close(); }
    },
  });

  return new Response(stream, { headers: {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'X-Accel-Buffering': 'no',
    Connection: 'keep-alive',
  } });
}
