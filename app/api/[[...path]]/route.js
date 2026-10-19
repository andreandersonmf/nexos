import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { ensureSeed } from '@/lib/nexos/seed-data';
import { ApiError, getUsuarioDaSessao, requireAuth, cookieOptions, serializarCookie, COOKIE_SESSAO, garantirEstruturaUsuarios } from '@/lib/nexos/auth';
import * as authHandler from '@/lib/nexos/handlers/auth';
import * as usuariosHandler from '@/lib/nexos/handlers/usuarios';
import * as alunosHandler from '@/lib/nexos/handlers/alunos';
import * as turmasHandler from '@/lib/nexos/handlers/turmas';
import * as professoresHandler from '@/lib/nexos/handlers/professores';
import * as frequenciaHandler from '@/lib/nexos/handlers/frequencia';
import * as desempenhoHandler from '@/lib/nexos/handlers/desempenho';
import * as documentosHandler from '@/lib/nexos/handlers/documentos';
import * as alertasHandler from '@/lib/nexos/handlers/alertas';
import * as comunicadosHandler from '@/lib/nexos/handlers/comunicados';
import * as relatoriosHandler from '@/lib/nexos/handlers/relatorios';
import * as configuracoesHandler from '@/lib/nexos/handlers/configuracoes';
import * as dashboardHandler from '@/lib/nexos/handlers/dashboard';
import * as nexoIaHandler from '@/lib/nexos/handlers/nexo-ia-chat';
import { resetSeed } from '@/lib/nexos/seed-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(data, status = 200) {
  return NextResponse.json(data, { status });
}

// Inicialização idempotente com cache por processo (evita rodar a cada request)
let estruturaGarantida = 0;
async function inicializar() {
  await ensureSeed();
  if (Date.now() - estruturaGarantida > 5 * 60 * 1000) {
    try {
      await garantirEstruturaUsuarios(await getDb());
    } catch { /* estrutura opcional */ }
    estruturaGarantida = Date.now();
  }
}

async function routeHandler(request, context) {
  const resolvedParams = await context.params;
  const parts = resolvedParams?.path || [];
  const path = '/' + parts.join('/');
  const method = request.method;
  const url = new URL(request.url);
  let db;

  try {
    await inicializar();
    db = await getDb();

    if (path === '/' || path === '' || path === '/health') {
      return json({ ok: true, service: "Nexo's API", version: '1.0.0' });
    }

    // ---------- AUTH (público) ----------
    if (path === '/auth/login' && method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const { token, usuario } = await authHandler.login(db, request, body);
      const res = json({ usuario });
      res.headers.set('Set-Cookie', serializarCookie(COOKIE_SESSAO, token, cookieOptions(request)));
      return res;
    }

    // ---------- Rotas protegidas ----------
    const usuario = await getUsuarioDaSessao(db, request);
    if (!usuario) throw new ApiError(401, 'Sessão inválida ou expirada. Faça login novamente.');

    const is = (p, m) => path === p && method === m;

    if (usuario.perfil === 'RESPONSAVEL') {
      const permitido =
        (path === '/auth/logout' && method === 'POST') ||
        (path === '/auth/me' && method === 'GET') ||
        (path === '/perfil/senha' && method === 'POST') ||
        (path === '/perfil' && method === 'PUT') ||
        (path === '/dashboard' && method === 'GET') ||
        (path === '/alunos' && method === 'GET') ||
        (path.startsWith('/alunos/') && method === 'GET' && parts.length === 2) ||
        (path === '/frequencia' && method === 'GET') ||
        (path === '/frequencia/resumo' && method === 'GET') ||
        (path === '/documentos' && method === 'GET') ||
        (path.startsWith('/documentos/') && method === 'GET' && parts.length === 3 && parts[2] === 'download') ||
        (path === '/comunicados' && method === 'GET') ||
        (path.startsWith('/comunicados/') && method === 'POST' && parts.length === 3 && parts[2] === 'leitura');
      if (!permitido) throw new ApiError(403, 'Seu perfil de responsável permite apenas consultar informações acadêmicas do aluno vinculado.');
    }

    // AUTH
    if (is('/auth/logout', 'POST')) {
      const r = await authHandler.logout(db, request, usuario);
      const res = json(r);
      res.headers.set('Set-Cookie', serializarCookie(COOKIE_SESSAO, '', { ...cookieOptions(request), maxAge: 0 }));
      return res;
    }
    if (is('/auth/me', 'GET')) return json(await authHandler.me(db, request, usuario));

    // SEED (administrador apenas — operação destrutiva controlada)
    if (is('/seed/reset', 'POST')) {
      requireAuth(usuario);
      if (usuario.perfil !== 'ADMIN') throw new ApiError(403, 'Apenas o administrador pode executar esta operação.');
      const r = await resetSeed();
      return json(r);
    }

    // DASHBOARD
    if (is('/dashboard', 'GET')) return json(await dashboardHandler.dashboard(db, usuario));

    // USUÁRIOS
    if (is('/usuarios', 'GET')) return json(await usuariosHandler.listarUsuarios(db, usuario));
    if (is('/usuarios', 'POST')) return json(await usuariosHandler.criarUsuario(db, usuario, await request.json().catch(() => ({}))), 201);
    if (path.startsWith('/usuarios/') && method === 'PATCH' && parts.length === 2) {
      return json(await usuariosHandler.atualizarUsuario(db, usuario, parts[1], await request.json().catch(() => ({}))));
    }
    if (path.startsWith('/usuarios/') && method === 'DELETE' && parts.length === 2) {
      return json(await usuariosHandler.excluirUsuario(db, usuario, parts[1]));
    }
    if (path.startsWith('/usuarios/') && method === 'POST' && parts.length === 3 && parts[2] === 'redefinir-senha') {
      return json(await usuariosHandler.redefinirSenha(db, usuario, parts[1]));
    }

    // ALUNOS
    if (is('/alunos', 'GET')) return json(await alunosHandler.listarAlunos(db, usuario, url.searchParams));
    if (is('/alunos', 'POST')) return json(await alunosHandler.criarAluno(db, usuario, await request.json().catch(() => ({}))), 201);
    if (path.startsWith('/alunos/') && method === 'GET' && parts.length === 2) {
      return json(await alunosHandler.detalharAluno(db, usuario, parts[1]));
    }
    if (path.startsWith('/alunos/') && method === 'PUT' && parts.length === 2) {
      return json(await alunosHandler.atualizarAluno(db, usuario, parts[1], await request.json().catch(() => ({}))));
    }

    // TURMAS
    if (is('/turmas', 'GET')) return json(await turmasHandler.listarTurmas(db, usuario));
    if (is('/turmas', 'POST')) return json(await turmasHandler.criarTurma(db, usuario, await request.json().catch(() => ({}))), 201);
    if (path.startsWith('/turmas/') && method === 'GET' && parts.length === 2) {
      return json(await turmasHandler.detalharTurma(db, usuario, parts[1]));
    }
    if (path.startsWith('/turmas/') && method === 'PATCH' && parts.length === 2) {
      return json(await turmasHandler.atualizarTurma(db, usuario, parts[1], await request.json().catch(() => ({}))));
    }
    if (path.startsWith('/turmas/') && method === 'POST' && parts.length === 3 && parts[2] === 'professores') {
      return json(await turmasHandler.gerenciarProfessoresTurma(db, usuario, parts[1], await request.json().catch(() => ({}))));
    }

    // PROFESSORES
    if (is('/professores', 'GET')) return json(await professoresHandler.listarProfessores(db, usuario));
    if (path.startsWith('/professores/') && method === 'GET' && parts.length === 2) {
      return json(await professoresHandler.detalharProfessor(db, usuario, parts[1]));
    }

    // MENSAGENS (chat interno)
    if (is('/mensagens/conversas', 'GET')) return json(await professoresHandler.listarConversas(db, usuario));
    if (is('/mensagens', 'POST')) return json(await professoresHandler.enviarMensagem(db, usuario, await request.json().catch(() => ({}))), 201);
    if (path.startsWith('/mensagens/') && method === 'GET' && parts.length === 2) {
      return json(await professoresHandler.historicoConversa(db, usuario, parts[1]));
    }

    // FREQUÊNCIA
    if (is('/frequencia', 'GET')) return json(await frequenciaHandler.consultarFrequencia(db, usuario, url.searchParams));
    if (is('/frequencia', 'POST')) return json(await frequenciaHandler.registrarFrequencia(db, usuario, await request.json().catch(() => ({}))));
    if (is('/frequencia/resumo', 'GET')) return json(await frequenciaHandler.resumoFrequencia(db, usuario, url.searchParams));

    // DESEMPENHO / NOTAS
    if (is('/disciplinas', 'GET')) return json(await desempenhoHandler.listarDisciplinas(db, usuario));
    if (is('/notas', 'GET')) return json(await desempenhoHandler.listarNotas(db, usuario, url.searchParams));
    if (is('/notas/batch', 'POST')) return json(await desempenhoHandler.salvarNotasEmLote(db, usuario, await request.json().catch(() => ({}))));
    if (is('/desempenho/resumo', 'GET')) return json(await desempenhoHandler.resumoDesempenho(db, usuario, url.searchParams));

    // ALERTAS
    if (is('/alertas', 'GET')) return json(await alertasHandler.listarAlertas(db, usuario, url.searchParams));
    if (is('/alertas', 'POST')) return json(await alertasHandler.criarAlertaManual(db, usuario, await request.json().catch(() => ({}))), 201);
    if (is('/alertas/regenerar', 'POST')) return json(await alertasHandler.regenerarAlertas(db, usuario));
    if (path.startsWith('/alertas/') && method === 'PATCH' && parts.length === 2) {
      return json(await alertasHandler.atualizarAlerta(db, usuario, parts[1], await request.json().catch(() => ({}))));
    }

    // DOCUMENTOS
    if (is('/documentos', 'GET')) return json(await documentosHandler.listarDocumentos(db, usuario, url.searchParams));
    if (is('/documentos', 'POST')) return json(await documentosHandler.publicarDocumento(db, usuario, request), 201);
    if (path.startsWith('/documentos/') && method === 'DELETE' && parts.length === 2) {
      return json(await documentosHandler.excluirDocumento(db, usuario, parts[1]));
    }
    if (path.startsWith('/documentos/') && method === 'GET' && parts.length === 3 && parts[2] === 'download') {
      const { doc, download } = await documentosHandler.baixarDocumento(db, usuario, parts[1]);
      const webStream = require('stream').Readable.toWeb(download);
      return new Response(webStream, {
        headers: {
          'Content-Type': doc.tipo_arquivo || 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${encodeURIComponent(doc.nome_arquivo)}"`,
        },
      });
    }

    // COMUNICADOS
    if (is('/comunicados', 'GET')) return json(await comunicadosHandler.listarComunicados(db, usuario, url.searchParams));
    if (is('/comunicados', 'POST')) return json(await comunicadosHandler.criarComunicado(db, usuario, await request.json().catch(() => ({}))), 201);
    if (path.startsWith('/comunicados/') && method === 'PATCH' && parts.length === 2) {
      return json(await comunicadosHandler.atualizarComunicado(db, usuario, parts[1], await request.json().catch(() => ({}))));
    }
    if (path.startsWith('/comunicados/') && method === 'DELETE' && parts.length === 2) {
      return json(await comunicadosHandler.excluirComunicado(db, usuario, parts[1]));
    }
    if (path.startsWith('/comunicados/') && method === 'POST' && parts.length === 3 && parts[2] === 'leitura') {
      return json(await comunicadosHandler.marcarLeitura(db, usuario, parts[1]));
    }

    // RELATÓRIOS
    if (path.startsWith('/relatorios/') && method === 'GET' && parts.length === 2) {
      const tipo = parts[1];
      const formato = url.searchParams.get('format');
      const r = await relatoriosHandler.gerarRelatorio(db, usuario, tipo, url.searchParams, formato);
      if (r.csv) {
        return new Response(r.csv, {
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="${r.nome}"`,
          },
        });
      }
      return json(r);
    }
    if (is('/relatorios', 'GET')) {
      const tipo = url.searchParams.get('tipo') || 'indicadores';
      const formato = url.searchParams.get('format');
      const r = await relatoriosHandler.gerarRelatorio(db, usuario, tipo, url.searchParams, formato);
      if (r.csv) {
        return new Response(r.csv, {
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="${r.nome}"`,
          },
        });
      }
      return json(r);
    }

    // CONFIGURAÇÕES
    if (is('/configuracoes', 'GET')) return json(await configuracoesHandler.obterConfiguracoes(db, usuario));
    if (is('/configuracoes', 'PATCH')) return json(await configuracoesHandler.atualizarConfiguracao(db, usuario, await request.json().catch(() => ({}))));
    if (is('/perfil', 'PUT')) return json(await configuracoesHandler.atualizarPerfil(db, usuario, await request.json().catch(() => ({}))));
    if (is('/perfil/senha', 'POST')) return json(await configuracoesHandler.alterarPropriaSenha(db, usuario, await request.json().catch(() => ({}))));

    // NEXO IA
    if (is('/nexo-ia/historico', 'GET')) return json(await nexoIaHandler.obterHistorico(db, usuario, url.searchParams));
    if (is('/nexo-ia/conversas', 'POST')) return json(await nexoIaHandler.novaConversa(db, usuario), 201);
    if (parts[0] === 'nexo-ia' && parts[1] === 'conversas' && parts.length === 3 && method === 'PATCH') {
      return json(await nexoIaHandler.renomearConversa(db, usuario, parts[2], await request.json().catch(() => ({}))));
    }
    if (parts[0] === 'nexo-ia' && parts[1] === 'conversas' && parts.length === 3 && method === 'DELETE') {
      return json(await nexoIaHandler.excluirConversa(db, usuario, parts[2]));
    }
    if (is('/nexo-ia/chat', 'POST')) {
      return await nexoIaHandler.chat(db, request, usuario, await request.json().catch(() => ({})));
    }

    return json({ error: `Rota não encontrada: ${method} ${path}` }, 404);
  } catch (error) {
    if (error instanceof ApiError) {
      return json({ error: error.message }, error.status);
    }
    console.error('[API ERROR]', method, path, error?.stack || error?.message || error);
    return json({ error: 'Erro interno do servidor.' }, 500);
  }
}

export const GET = routeHandler;
export const POST = routeHandler;
export const PUT = routeHandler;
export const DELETE = routeHandler;
export const PATCH = routeHandler;
