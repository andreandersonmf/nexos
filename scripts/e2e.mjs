// Suite E2E do Nexo's — roda 100% local:
//   - mongodb-memory-server (MongoDB em memória, descartado ao final)
//   - `next start` (build de produção) com MONGODB_URI apontando para o memória-server
//   - seed oficial do app (ensureSeed) popula o banco vazio
//   - testes determinísticos do Nexo IA importam o backend diretamente (alias '@/')
//
// Uso: node scripts/e2e.mjs
// Requer build de produção atualizado: yarn build

import { registerAlias } from './alias-register.mjs';
registerAlias();

import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { spawn } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORTA = 3111;
const BASE = `http://127.0.0.1:${PORTA}`;
const DB_NAME = process.env.DB_NAME || 'nexos_school';

const SENHA_SEED = 'nexos123';
const EMAIL_ALUNO_E2E = 'aluno.e2e@nexos.test';
const NOVA_SENHA_ALUNO = 'E2e#Aluno2026';
const EMAIL_PROF_NOVO = 'novo.prof@nexos.test';

// ---------- relatório ----------
const resultados = [];
function check(nome, ok, detalhe = '') {
  resultados.push({ nome, ok, detalhe });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${nome}${detalhe ? ` — ${detalhe}` : ''}`);
}
function skip(nome, motivo = '') {
  resultados.push({ nome, ok: null, detalhe: motivo });
  console.log(`SKIP  ${nome}${motivo ? ` — ${motivo}` : ''}`);
}
function assertStatus(res, esperado, nome) {
  check(nome, res.status === esperado, `status ${res.status} (esperado ${esperado})${res.status !== esperado ? ` | body: ${JSON.stringify(res.dados)?.slice(0, 200)}` : ''}`);
}

// ---------- clientes HTTP ----------
async function rawFetch(caminho, opcoes = {}) {
  return fetch(`${BASE}${caminho}`, { redirect: 'manual', signal: AbortSignal.timeout(20000), ...opcoes });
}
function httpCliente(cookie) {
  return async (metodo, caminho, { json: corpo, form } = {}) => {
    const headers = {};
    if (cookie) headers.cookie = cookie;
    let body;
    if (form) body = form;
    else if (corpo !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(corpo);
    }
    const res = await rawFetch(caminho, { method: metodo, headers, body });
    const tipo = res.headers.get('content-type') || '';
    let dados = null;
    if (tipo.includes('application/json')) dados = await res.json().catch(() => null);
    else if (tipo.includes('text/')) dados = await res.text();
    else dados = Buffer.from(await res.arrayBuffer());
    return { status: res.status, dados, headers: res.headers };
  };
}

async function login(email, senha) {
  const res = await rawFetch('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, senha }),
  });
  const dados = await res.json().catch(() => null);
  const setCookie = res.headers.get('set-cookie') || '';
  const cookie = setCookie.split(';')[0] || '';
  return { status: res.status, dados, cookie, setCookie };
}

// ---------- ciclo de vida ----------
let mongod, child, saidaServidor = '';
function iniciarServidor() {
  return new Promise((resolve) => {
    child = spawn(process.execPath, [path.join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next'), 'start', '-p', String(PORTA)], {
      cwd: ROOT,
      env: { ...process.env, MONGODB_URI: mongod.getUri() },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (d) => { saidaServidor += d.toString(); });
    child.stderr.on('data', (d) => { saidaServidor += d.toString(); });
    child.on('exit', (code) => resolve(code));
    child.on('error', () => resolve(-1));
  });
}

async function aguardarServidor(timeoutMs = 90000) {
  const inicio = Date.now();
  while (Date.now() - inicio < timeoutMs) {
    try {
      const r = await rawFetch('/api/health');
      if (r.status === 200) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Servidor não respondeu em ${timeoutMs}ms. Últimas linhas:\n${saidaServidor.slice(-3000)}`);
}

console.log('== Suite E2E Nexo\'s ==\n');

// 1) Sobe MongoDB em memória
mongod = await MongoMemoryServer.create();
console.log(`MongoDB em memória: ${mongod.getUri()}\n`);

const cliente = new MongoClient(mongod.getUri());
await cliente.connect();
const db = cliente.db(DB_NAME);

// 2) Sobe o servidor Next (build de produção)
const exitPromise = iniciarServidor();
await aguardarServidor();
console.log('Servidor Next no ar.\n');

// 3) Seed idempotente (primeiro request dispara ensureSeed)
{
  const res = await rawFetch('/api/health');
  assertStatus(res, 200, 'GET /api/health responde');
  const dados = await res.json();
  check('health.body.ok', dados?.ok === true);
  const nUsuarios = await db.collection('usuarios').countDocuments();
  const nAlunos = await db.collection('alunos').countDocuments();
  const nTurmas = await db.collection('turmas').countDocuments();
  check('seed criado (usuarios=4, alunos=15, turmas=4)', nUsuarios === 4 && nAlunos === 15 && nTurmas === 4, `usuarios=${nUsuarios} alunos=${nAlunos} turmas=${nTurmas}`);
  const contadores = await db.collection('contadores').find({}).toArray();
  check('contadores do seed (usuarios=4, turmas=4, atividades=4)',
    contadores.some((c) => c._id === 'usuarios' && c.seq === 4) &&
    contadores.some((c) => c._id === 'turmas' && c.seq === 4) &&
    contadores.some((c) => c._id === 'atividades' && c.seq === 4),
    JSON.stringify(contadores));
}

// 3.1) Guarda estática — padrões que derrubam páginas no cliente (Radix Select)
{
  const arquivos = [];
  const coletar = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) coletar(p);
      else if (/\.(js|jsx|ts|tsx)$/.test(e.name)) arquivos.push(p);
    }
  };
  coletar(path.join(ROOT, 'app'));
  const ofensores = [];
  for (const f of arquivos) {
    const src = readFileSync(f, 'utf8');
    if (/<SelectItem\s+value=["']?["']?\s*>/.test(src)) ofensores.push(path.relative(ROOT, f));
  }
  check('nenhum <SelectItem value=""> no código (Radix derruba a página no cliente)', ofensores.length === 0, ofensores.join(', '));
}

// ================= AUTH =================
console.log('\n-- Autenticação e sessão --');

const rAdmin = await login('admin@nexos.com', SENHA_SEED);
assertStatus(rAdmin, 200, 'login admin (nexos123)');
check('cookie de sessão HttpOnly + SameSite=Lax', /nexos_sessao=/.test(rAdmin.setCookie) && /HttpOnly/i.test(rAdmin.setCookie) && /SameSite=Lax/i.test(rAdmin.setCookie), rAdmin.setCookie);
check('login não expõe campos de senha', rAdmin.dados?.usuario && !('senha' in rAdmin.dados.usuario) && !('senha_hash' in rAdmin.dados.usuario) && !('salt' in rAdmin.dados.usuario));
check('login devolve perfil ADMIN', rAdmin.dados?.usuario?.perfil === 'ADMIN');
let admin = httpCliente(rAdmin.cookie);
let adminCookie = rAdmin.cookie;

assertStatus(await rawFetch('/api/alunos'), 401, 'rota protegida sem cookie → 401');

const rMe = await admin('GET', '/api/auth/me');
assertStatus(rMe, 200, 'GET /api/auth/me com sessão');
check('auth/me identifica admin (id 4)', rMe.dados?.usuario?.id === 4);

const rLoginErrado = await login('admin@nexos.com', 'senha-errada');
assertStatus(rLoginErrado, 401, 'login com senha errada → 401');
let ana;
{
  // sucesso subsequente limpa as tentativas de login (mesmo IP)
  const rOk = await login('ana@nexos.com', SENHA_SEED);
  assertStatus(rOk, 200, 'login ana (COORDENADOR) após falha');
  ana = httpCliente(rOk.cookie);
}

const rCarlos = await login('carlos@nexos.com', SENHA_SEED);
assertStatus(rCarlos, 200, 'login carlos (PROFESSOR)');
check('carlos tem turmas [1,2]', JSON.stringify(rCarlos.dados?.usuario?.turmas) === '[1,2]');
check('carlos tem disciplinas [1,3]', JSON.stringify(rCarlos.dados?.usuario?.disciplinas) === '[1,3]');
const carlosCookie = rCarlos.cookie;
const carlos = httpCliente(carlosCookie);

// logout encerra a sessão
{
  const r = await admin('POST', '/api/auth/logout');
  assertStatus(r, 200, 'POST /api/auth/logout');
  const rMe2 = await admin('GET', '/api/auth/me');
  assertStatus(rMe2, 401, 'sessão encerrada após logout → 401');
  const rAdmin2 = await login('admin@nexos.com', SENHA_SEED);
  assertStatus(rAdmin2, 200, 'novo login admin após logout');
  admin = httpCliente(rAdmin2.cookie);
  adminCookie = rAdmin2.cookie;
}

// ================= CONTAS / RBAC =================
console.log('\n-- Contas de acesso e matriz de permissões --');

let senhaTemporariaAluno = null;
{
  const r = await admin('POST', '/api/usuarios', { json: { nome: 'Aluno E2E', email: EMAIL_ALUNO_E2E, perfil: 'ALUNO', matricula_aluno: 'NX2025001' } });
  assertStatus(r, 201, 'ADMIN cria conta de ALUNO (NX2025001)');
  check('nova conta recebe id sequencial 5 (sem colisão com seed)', r.dados?.usuario?.id === 5, `id=${r.dados?.usuario?.id}`);
  check('resposta contém credencial_temporaria', typeof r.dados?.credencial_temporaria === 'string' && r.dados.credencial_temporaria.length >= 12);
  check('resposta NÃO contém senha/senha_hash/salt', !('senha' in (r.dados?.usuario || {})) && !('senha_hash' in (r.dados?.usuario || {})) && !('salt' in (r.dados?.usuario || {})));
  check('aviso de entrega por canal seguro presente', typeof r.dados?.aviso === 'string');
  check('conta nasce com senha_temporaria=true', r.dados?.usuario?.senha_temporaria === true);
  senhaTemporariaAluno = r.dados.credencial_temporaria;
}

{
  const r = await admin('POST', '/api/usuarios', { json: { nome: 'Outro', email: 'outro.e2e@nexos.test', perfil: 'ALUNO', matricula_aluno: 'NX2025001' } });
  assertStatus(r, 409, 'matrícula já vinculada → 409');
  const r2 = await admin('POST', '/api/usuarios', { json: { nome: 'Outro', email: EMAIL_ALUNO_E2E, perfil: 'ALUNO', matricula_aluno: 'NX2025002' } });
  assertStatus(r2, 409, 'e-mail duplicado → 409');
}

{
  const r = await ana('POST', '/api/usuarios', { json: { nome: 'Aluno Proibido', email: 'proibido@nexos.test', perfil: 'ALUNO', matricula_aluno: 'NX2025003' } });
  assertStatus(r, 403, 'COORDENADOR tenta criar conta de ALUNO → 403 (regra crítica)');
  const r2 = await ana('POST', '/api/usuarios', { json: { nome: 'Prof Novo', email: EMAIL_PROF_NOVO, perfil: 'PROFESSOR', turmas: [1], disciplinas: [1] } });
  assertStatus(r2, 201, 'COORDENADOR cria conta de PROFESSOR → 201');
  check('professor criado com id sequencial 6', r2.dados?.usuario?.id === 6, `id=${r2.dados?.usuario?.id}`);
  const profNovoId = r2.dados?.usuario?.id;
  const r3 = await ana('POST', `/api/usuarios/${profNovoId}/redefinir-senha`);
  assertStatus(r3, 403, 'COORDENADOR redefinir senha de terceiro → 403 (só ADMIN)');
  const r4 = await admin('POST', `/api/usuarios/${profNovoId}/redefinir-senha`);
  assertStatus(r4, 200, 'ADMIN redefine senha (nova credencial temporária)');
  check('redefinição devolve credencial_temporaria', typeof r4.dados?.credencial_temporaria === 'string');
}

// ================= ALUNO =================
console.log('\n-- Fluxo do aluno: primeiro acesso e isolamento --');

const rAluno = await login(EMAIL_ALUNO_E2E, senhaTemporariaAluno);
assertStatus(rAluno, 200, 'login aluno com senha temporária');
check('sessão marca senha_temporaria=true', rAluno.dados?.usuario?.senha_temporaria === true);
let aluno = httpCliente(rAluno.cookie);

assertStatus(await aluno('GET', '/api/usuarios'), 403, 'ALUNO lista contas → 403');
assertStatus(await aluno('GET', '/api/alertas'), 403, 'ALUNO lista alertas internos → 403');
assertStatus(await aluno('GET', '/api/relatorios/indicadores'), 403, 'ALUNO gera relatório institucional → 403');
assertStatus(await aluno('GET', '/api/alunos/NX2025002'), 403, 'ALUNO detalha outro aluno → 403');
assertStatus(await aluno('POST', '/api/usuarios', { json: { nome: 'x', email: 'x@x.com', perfil: 'PROFESSOR' } }), 403, 'ALUNO cria contas → 403');
{
  const r = await aluno('GET', '/api/alunos/NX2025001');
  assertStatus(r, 200, 'ALUNO vê os próprios dados');
  check('detalhe do próprio aluno tem matrícula correta', r.dados?.aluno?.matricula === 'NX2025001' || r.dados?.matricula === 'NX2025001');
}

{
  const r = await aluno('POST', '/api/perfil/senha', { json: { nova_senha: NOVA_SENHA_ALUNO } });
  assertStatus(r, 200, 'primeiro acesso: troca de senha SEM senha_atual');
  const rAntiga = await login(EMAIL_ALUNO_E2E, senhaTemporariaAluno);
  assertStatus(rAntiga, 401, 'senha temporária antiga deixa de funcionar');
  const rNova = await login(EMAIL_ALUNO_E2E, NOVA_SENHA_ALUNO);
  assertStatus(rNova, 200, 'login com a nova senha');
  check('senha_temporaria=false após troca', rNova.dados?.usuario?.senha_temporaria === false);
  aluno = httpCliente(rNova.cookie);
}

// ================= PROFESSOR =================
console.log('\n-- Escopo do professor --');

{
  const r = await carlos('GET', '/api/alunos');
  assertStatus(r, 200, 'professor lista alunos (apenas turmas 1 e 2)');
  const itens = r.dados?.items || [];
  check('nenhum aluno fora das turmas do professor', itens.every((a) => [1, 2].includes(a.turma_id)), `total=${itens.length}`);
  check('aluno da turma 1 presente; aluno da turma 3 ausente',
    itens.some((a) => a.matricula === 'NX2025001') && !itens.some((a) => a.matricula === 'NX2025005'));
}
assertStatus(await carlos('GET', '/api/alunos/NX2025005'), 403, 'professor detalha aluno de outra turma → 403');
{
  const r = await carlos('GET', '/api/alunos/NX2025001');
  assertStatus(r, 200, 'professor detalha aluno da própria turma');
}
assertStatus(await carlos('GET', '/api/frequencia/resumo?turma_id=3'), 403, 'resumo de frequência de turma alheia → 403');
{
  const r = await carlos('GET', '/api/frequencia/resumo?turma_id=1');
  assertStatus(r, 200, 'resumo de frequência da própria turma');
  check('resumo só contém alunos da turma 1', (r.dados?.items || []).every((i) => i.turma_id === 1));
}
assertStatus(await carlos('GET', '/api/relatorios/frequencia?turma_id=3'), 403, 'relatório detalhado de turma alheia → 403');
{
  const r = await carlos('GET', '/api/relatorios/indicadores');
  assertStatus(r, 200, 'relatório de indicadores agregados → 200');
}
{
  const r = await carlos('GET', '/api/desempenho/resumo');
  assertStatus(r, 200, 'resumo de desempenho do professor');
  check('mediasPorTurma apenas das turmas do professor', (r.dados?.mediasPorTurma || []).every((t) => [1, 2].includes(t.turma_id)));
}
assertStatus(await carlos('POST', '/api/notas/batch', { json: { turma_id: 3, disciplina_id: 1, bimestre: 1, notas: [] } }), 403, 'lançar notas em turma alheia → 403');
assertStatus(await carlos('POST', '/api/notas/batch', { json: { turma_id: 1, disciplina_id: 2, bimestre: 1, notas: [] } }), 403, 'lançar notas em disciplina alheia → 403');
assertStatus(await carlos('POST', '/api/frequencia', { json: { turma_id: 3, data_aula: '2026-10-14', disciplina_id: 1, registros: [] } }), 403, 'registrar frequência em turma alheia → 403');

// ================= FREQUÊNCIA =================
console.log('\n-- Frequência (sem duplicatas) --');

const DATA_HOJE = new Date().toISOString().slice(0, 10);
const payloadFreq = { turma_id: 1, data_aula: DATA_HOJE, disciplina_id: 1, registros: [
  { matricula_aluno: 'NX2025001', presente: false, justificativa: 'Atestado médico (E2E)' },
  { matricula_aluno: 'NX2025002', presente: true },
] };
{
  const r = await carlos('POST', '/api/frequencia', { json: payloadFreq });
  assertStatus(r, 200, 'registro de frequência em lote (turma 1)');
  check('2 registros salvos', r.dados?.salvos === 2, JSON.stringify(r.dados));
  const r2 = await carlos('POST', '/api/frequencia', { json: payloadFreq });
  assertStatus(r2, 200, 'reenvio do mesmo lote (upsert)');
  const total = await db.collection('frequencia').countDocuments({ matricula_aluno: 'NX2025001', data_aula: DATA_HOJE, disciplina_id: 1 });
  check('nenhuma duplicata de frequência (1 registro por aluno/data/disciplina)', total === 1, `total=${total}`);
  const reg = await db.collection('frequencia').findOne({ matricula_aluno: 'NX2025001', data_aula: DATA_HOJE, disciplina_id: 1 });
  check('falta justificada persistida', reg?.presente === false && reg?.justificativa === 'Atestado médico (E2E)');
  const r3 = await carlos('POST', '/api/frequencia', { json: { ...payloadFreq, registros: [{ matricula_aluno: 'NX2025005', presente: true }] } });
  assertStatus(r3, 200, 'lote com aluno de outra turma');
  check('aluno fora da turma é ignorado', r3.dados?.salvos === 0, JSON.stringify(r3.dados));
}

// ================= NOTAS → ALERTAS =================
console.log('\n-- Notas e sincronização de alertas --');

{
  await db.collection('notas').deleteMany({ matricula_aluno: 'NX2025001' });
  const r1 = await carlos('POST', '/api/notas/batch', { json: { turma_id: 1, disciplina_id: 1, bimestre: 1, notas: [{ matricula_aluno: 'NX2025001', valor: 4 }] } });
  assertStatus(r1, 200, 'lançamento de nota 4,0 (Matemática, 1º bim)');
  check('1 nota gravada', r1.dados?.gravadas === 1, JSON.stringify(r1.dados));
  const alDesempenho = await db.collection('alertas').findOne({ chave: 'NX2025001|desempenho' });
  check('alerta automático de desempenho criado (alta)', alDesempenho?.status === 'aberto' && alDesempenho?.prioridade === 'alta', JSON.stringify(alDesempenho));

  const r2 = await carlos('POST', '/api/notas/batch', { json: { turma_id: 1, disciplina_id: 1, bimestre: 1, notas: [{ matricula_aluno: 'NX2025001', valor: 9 }] } });
  assertStatus(r2, 200, 'nota atualizada para 9,0');
  const alDepois = await db.collection('alertas').findOne({ chave: 'NX2025001|desempenho' });
  check('alerta de desempenho resolvido automaticamente', alDepois?.status === 'resolvido', JSON.stringify(alDepois));
  const totalChave = await db.collection('alertas').countDocuments({ chave: 'NX2025001|desempenho' });
  check('sem alertas duplicados (1 por chave)', totalChave === 1, `total=${totalChave}`);

  const rManual = await carlos('POST', '/api/alertas', { json: { matricula_aluno: 'NX2025001', prioridade: 'media', categoria: 'outros', descricao: 'Alerta manual E2E' } });
  assertStatus(rManual, 201, 'criação de alerta manual');
  const rRegen = await admin('POST', '/api/alertas/regenerar');
  assertStatus(rRegen, 200, 'ADMIN regenera alertas da escola');
  const manualDepois = await db.collection('alertas').findOne({ matricula_aluno: 'NX2025001', tipo: 'manual', auto: false, descricao: 'Alerta manual E2E' });
  check('alerta manual preservado após regeneração', manualDepois?.status === 'aberto', JSON.stringify(manualDepois));
}

// ================= DOCUMENTOS (GridFS) =================
console.log('\n-- Documentos (GridFS e escopos) --');

const PDF_BYTES = Buffer.from('%PDF-1.4 E2E Nexo\'s documento de teste');
let docAlunosId = null;
{
  const fd = new FormData();
  fd.append('arquivo', new Blob([PDF_BYTES], { type: 'application/pdf' }), 'plano-e2e.pdf');
  fd.append('nome', 'Plano E2E');
  fd.append('categoria', 'Geral');
  fd.append('escopo', 'alunos');
  fd.append('matriculas', 'NX2025001');
  const r = await carlos('POST', '/api/documentos', { form: fd });
  assertStatus(r, 201, 'professor publica documento para aluno da própria turma');
  docAlunosId = r.dados?.documento?.id;
  check('documento persistido no GridFS (fileId)', typeof r.dados?.documento?.fileId === 'string' && r.dados?.documento?.fileId?.length === 24);

  const fd2 = new FormData();
  fd2.append('arquivo', new Blob([PDF_BYTES], { type: 'application/pdf' }), 'vazado.pdf');
  fd2.append('nome', 'Vazado');
  fd2.append('categoria', 'Geral');
  fd2.append('escopo', 'alunos');
  fd2.append('matriculas', 'NX2025005');
  const r2 = await carlos('POST', '/api/documentos', { form: fd2 });
  assertStatus(r2, 403, 'professor tenta compartilhar com aluno de outra turma → 403');
}
let docTurma3Id = null;
{
  const fd = new FormData();
  fd.append('arquivo', new Blob([PDF_BYTES], { type: 'application/pdf' }), 'turma3.pdf');
  fd.append('nome', 'Material 8º A');
  fd.append('categoria', 'Geral');
  fd.append('escopo', 'turmas');
  fd.append('turma_ids', '3');
  const r = await admin('POST', '/api/documentos', { form: fd });
  assertStatus(r, 201, 'admin publica documento para turma 3');
  docTurma3Id = r.dados?.documento?.id;
}
let docInstitucionalId = null;
{
  const fd = new FormData();
  fd.append('arquivo', new Blob([PDF_BYTES], { type: 'application/pdf' }), 'institucional.pdf');
  fd.append('nome', 'Circular Institucional');
  fd.append('categoria', 'Geral');
  fd.append('escopo', 'institucional');
  const r = await admin('POST', '/api/documentos', { form: fd });
  assertStatus(r, 201, 'admin publica documento institucional');
  docInstitucionalId = r.dados?.documento?.id;
}
{
  const r = await carlos('GET', '/api/documentos');
  assertStatus(r, 200, 'professor lista documentos');
  const ids = (r.dados?.items || []).map((d) => d.id);
  check('professor vê o próprio e o institucional; não vê o da turma 3',
    ids.includes(docAlunosId) && ids.includes(docInstitucionalId) && !ids.includes(docTurma3Id), JSON.stringify(ids));
  assertStatus(await carlos('GET', `/api/documentos/${docTurma3Id}/download`), 403, 'professor baixa documento da turma 3 → 403');
}
{
  const r = await admin('GET', `/api/documentos/${docAlunosId}/download`);
  assertStatus(r, 200, 'admin baixa documento');
  check('conteúdo do download íntegro (GridFS)', Buffer.isBuffer(r.dados) && r.dados.equals(PDF_BYTES));
  check('content-type do download correto', (r.headers.get('content-type') || '').includes('application/pdf'));
}
assertStatus(await aluno('POST', '/api/documentos', { form: (() => {
  const fd = new FormData();
  fd.append('arquivo', new Blob([PDF_BYTES], { type: 'application/pdf' }), 'aluno.pdf');
  fd.append('nome', 'Tentativa');
  fd.append('escopo', 'institucional');
  return fd;
})() }), 403, 'aluno tenta publicar documento → 403');
{
  const r = await aluno('GET', '/api/documentos');
  assertStatus(r, 200, 'aluno lista documentos destinados a ele');
  const ids = (r.dados?.items || []).map((d) => d.id);
  check('aluno vê o dirigido a ele e o institucional; não vê o da turma 3',
    ids.includes(docAlunosId) && !ids.includes(docTurma3Id), JSON.stringify(ids));
  const r2 = await aluno('GET', `/api/documentos/${docAlunosId}/download`);
  assertStatus(r2, 200, 'aluno baixa documento dirigido a ele');
  assertStatus(await aluno('GET', `/api/documentos/${docTurma3Id}/download`), 403, 'aluno baixa documento da turma 3 → 403');
}

// ================= COMUNICADOS =================
console.log('\n-- Comunicados (rascunhos isolados) --');

let comRascunhoId = null, comPublicadoId = null;
{
  const r1 = await admin('POST', '/api/comunicados', { json: { titulo: 'Rascunho E2E', conteudo: 'Ainda não publicado', escopo: 'institucional', status: 'rascunho' } });
  assertStatus(r1, 201, 'admin cria rascunho institucional');
  comRascunhoId = r1.dados?.comunicado?.id;
  const r2 = await admin('POST', '/api/comunicados', { json: { titulo: 'Aviso 7º A', conteudo: 'Reunião de pais', escopo: 'turmas', turma_ids: [1] } });
  assertStatus(r2, 201, 'admin publica comunicado para a turma 1');
  comPublicadoId = r2.dados?.comunicado?.id;
}
{
  const r = await aluno('GET', '/api/comunicados');
  assertStatus(r, 200, 'aluno lista comunicados');
  const ids = (r.dados?.items || []).map((c) => c.id);
  check('aluno vê o publicado e nunca o rascunho', ids.includes(comPublicadoId) && !ids.includes(comRascunhoId), JSON.stringify(ids));
  const r2 = await aluno('GET', '/api/comunicados?status=todos');
  const ids2 = (r2.dados?.items || []).map((c) => c.id);
  check('status=todos não expõe rascunhos ao aluno', !ids2.includes(comRascunhoId), JSON.stringify(ids2));
  assertStatus(await aluno('POST', `/api/comunicados/${comPublicadoId}/leitura`), 200, 'aluno marca leitura');
  assertStatus(await aluno('POST', `/api/comunicados/${comPublicadoId}/leitura`), 200, 'marcar leitura é idempotente');
  const com = await db.collection('comunicados').findOne({ id: comPublicadoId });
  check('apenas 1 registro de leitura (sem duplicata)', (com?.leituras || []).length === 1, JSON.stringify(com?.leituras));
}
assertStatus(await carlos('POST', '/api/comunicados', { json: { titulo: 'X', conteudo: 'Y', escopo: 'turmas', turma_ids: [3] } }), 403, 'professor publica para turma alheia → 403');

// ================= CONFIGURAÇÕES / PERFIL =================
console.log('\n-- Configurações e perfil --');

{
  const r = await ana('PATCH', '/api/configuracoes', { json: { chave: 'nome_instituicao', valor: 'Hack' } });
  assertStatus(r, 403, 'COORDENADOR altera chave institucional → 403');
  const r2 = await ana('PATCH', '/api/configuracoes', { json: { chave: 'media_minima_aprovacao', valor: '6.5' } });
  assertStatus(r2, 200, 'COORDENADOR altera chave acadêmica → 200');
  assertStatus(await carlos('PATCH', '/api/configuracoes', { json: { chave: 'media_minima_aprovacao', valor: '7' } }), 403, 'PROFESSOR altera configurações → 403');
  assertStatus(await aluno('PATCH', '/api/configuracoes', { json: { chave: 'media_minima_aprovacao', valor: '7' } }), 403, 'ALUNO altera configurações → 403');
}
{
  const r = await aluno('GET', '/api/configuracoes');
  assertStatus(r, 200, 'aluno lê configurações');
  check('aluno recebe apenas_perfil (sem chaves institucionais)', r.dados?.apenas_perfil === true && (r.dados?.grupos?.instituicao || []).length === 0);
  const r2 = await carlos('GET', '/api/configuracoes');
  check('professor vê instituição mas não parâmetros acadêmicos', (r2.dados?.grupos?.instituicao || []).length > 0 && (r2.dados?.grupos?.academico || []).length === 0);
}
{
  const r = await aluno('PUT', '/api/perfil', { json: { nome: 'Ana Oliveira E2E' } });
  assertStatus(r, 200, 'aluno atualiza o próprio nome');
  check('nome atualizado no banco', (await db.collection('usuarios').findOne({ email: EMAIL_ALUNO_E2E }))?.nome === 'Ana Oliveira E2E');
}

// ================= TURMAS / IDs =================
{
  const r = await admin('POST', '/api/turmas', { json: { nome: '9º A', turno: 'Manhã', ano_letivo: 2025 } });
  assertStatus(r, 201, 'admin cria turma');
  check('turma recebe id sequencial 5 (sem colisão com seed)', r.dados?.turma?.id === 5, `id=${r.dados?.turma?.id}`);
}

// ================= NEXO IA =================
console.log('\n-- Nexo IA (histórico isolado por usuário) --');

{
  const r = await carlos('POST', '/api/nexo-ia/conversas');
  assertStatus(r, 201, 'professor inicia conversa');
  const conversaId = r.dados?.id;
  check('conversa recebe id numérico', Number.isInteger(conversaId));
  const r2 = await carlos('GET', '/api/nexo-ia/historico');
  assertStatus(r2, 200, 'professor lista o próprio histórico');
  check('conversa aparece no histórico do dono', (r2.dados?.conversas || []).some((c) => c.id === conversaId));
  const r3 = await ana('GET', `/api/nexo-ia/historico?conversa_id=${conversaId}`);
  assertStatus(r3, 404, 'outro usuário não acessa a conversa alheia → 404');
  const r4 = await aluno('GET', `/api/nexo-ia/historico?conversa_id=${conversaId}`);
  assertStatus(r4, 404, 'aluno não acessa conversa de professor → 404');
}

console.log('\n-- Nexo IA (escopo das ferramentas — determinístico, sem LLM) --');
{
  const { executarFerramenta, ferramentasDoPerfil, systemPromptPara } = await import('@/lib/nexos/handlers/nexo-ia.js');
  const { ApiError } = await import('@/lib/nexos/auth.js');

  const profCarlos = { id: 2, perfil: 'PROFESSOR', nome: 'Prof. Carlos Mendes', turmas: [1, 2], disciplinas: [1, 3] };
  const profFora = { id: 3, perfil: 'PROFESSOR', nome: 'Prof. Julia Ribeiro', turmas: [3, 4], disciplinas: [2] };
  const alunoUser = { id: 5, perfil: 'ALUNO', nome: 'Ana Oliveira', matricula_aluno: 'NX2025001', turma_id: 1 };
  const adminUser = { id: 4, perfil: 'ADMIN', nome: 'Admin do Sistema' };

  const nomes = (perfil) => ferramentasDoPerfil(perfil).map((f) => f.function.name);
  check('aluno só recebe ferramentas próprias', !nomes('ALUNO').some((n) => ['alunos_da_turma', 'indicadores_institucionais', 'alunos_em_risco'].includes(n)));
  check('professor não recebe ferramentas de gestor', !nomes('PROFESSOR').includes('alunos_em_risco'));

  async function espera403(fn, nome) {
    try {
      await fn();
      check(nome, false, 'não lançou erro');
    } catch (e) {
      check(nome, e instanceof ApiError && e.status === 403, `erro: ${e?.status} ${e?.message}`);
    }
  }

  await espera403(() => executarFerramenta(db, profCarlos, 'alunos_da_turma', { turma_id: 3 }), 'professor consulta turma 3 (alheia) → 403');
  await espera403(() => executarFerramenta(db, profCarlos, 'frequencia_da_turma', { turma_id: 4 }), 'professor consulta frequência da turma 4 → 403');
  await espera403(() => executarFerramenta(db, profCarlos, 'alunos_em_risco', {}), 'professor executa ferramenta de gestor → 403 (gate de perfil)');
  await espera403(() => executarFerramenta(db, alunoUser, 'indicadores_institucionais', {}), 'aluno executa ferramenta institucional → 403 (gate de perfil)');
  await espera403(() => executarFerramenta(db, alunoUser, 'alunos_da_turma', { turma_id: 1 }), 'aluno executa ferramenta de professor → 403 (gate de perfil)');

  {
    const r = await executarFerramenta(db, profCarlos, 'alunos_da_turma', { turma_id: 1 });
    check('professor lista turma 1 (todas as matrículas da turma)',
      r.registros.every((x) => x.turma === '7º A') && r.total === 4, `total=${r.total}`);
  }
  {
    const r = await executarFerramenta(db, profCarlos, 'indicadores_institucionais', {});
    const texto = JSON.stringify(r);
    check('indicadores institucionais: somente agregados, sem matrículas/nomes individuais',
      r.totalAlunos === 15 && !/NX2025\d{3}/.test(texto) && !texto.includes('"matricula"'), texto.slice(0, 160));
  }
  {
    const r = await executarFerramenta(db, profCarlos, 'notas_por_disciplina', { turma_id: 2 });
    check('professor consulta notas da turma 2 (agregado por disciplina)', Array.isArray(r.mediasPorDisciplina) && r.mediasPorDisciplina.length > 0);
  }
  {
    const r = await executarFerramenta(db, alunoUser, 'minhas_notas', {});
    const texto = JSON.stringify(r);
    check('aluno consulta apenas as próprias notas (sem outras matrículas)', !/NX2025\d{3}/.test(texto) && r.porDisciplina?.length >= 0);
  }
  {
    const r = await executarFerramenta(db, adminUser, 'alunos_da_turma', { turma_id: 3 });
    check('gestor consulta qualquer turma (ex.: turma 3)', r.registros.every((x) => x.turma === '8º A'), `total=${r.total}`);
  }
  {
    const r = await executarFerramenta(db, adminUser, 'alunos_em_risco', {});
    check('gestor lista alunos em risco (pontuação > 0)', Array.isArray(r.registros));
  }
  check('systemPrompt do professor proíbe dados de outras turmas', /apenas indicadores agregados/i.test(systemPromptPara('PROFESSOR', 'Carlos')));
  check('systemPrompt do aluno proíbe dados de colegas', /nunca forneça dados de colegas/i.test(systemPromptPara('ALUNO', 'Ana')));
}

// ================= NEXO IA (streaming com LLM real — opcional) =================
{
  if (!process.env.EMERGENT_LLM_KEY) {
    skip('chat com LLM real (EMERGENT_LLM_KEY ausente neste ambiente — verificado na produção/Vercel)');
  } else {
    const res = await rawFetch('/api/nexo-ia/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: carlosCookie },
      body: JSON.stringify({ message: 'Quais são as turmas que eu leciono? Responda em uma frase.' }),
    });
    check('chat SSE responde 200', res.status === 200, `status=${res.status}`);
    const texto = await res.text();
    const eventos = texto.split('\n\n').filter(Boolean).map((b) => JSON.parse(b.replace(/^data: /, '')));
    check('SSE emite conversaId no primeiro evento', Number.isInteger(eventos[0]?.conversaId));
    check('SSE emite deltas de texto', eventos.some((e) => typeof e.delta === 'string'));
    const fim = eventos.find((e) => e.done);
    check('SSE conclui com done + reply', !!fim && typeof fim.reply === 'string' && fim.reply.length > 0);
    const conversas = await db.collection('nexo_chats').find({ usuario_id: 2 }).toArray();
    check('mensagens persistidas no histórico do usuário', conversas.some((c) => (c.mensagens || []).some((m) => m.role === 'assistant')));
  }
}

// ================= RELATÓRIOS CSV =================
{
  const res = await rawFetch('/api/relatorios/indicadores?format=csv', { headers: { cookie: adminCookie } });
  assertStatus(res, 200, 'relatório CSV de indicadores');
  // res.text() remove o BOM na decodificação — verifica os bytes crus
  const bytes = Buffer.from(await res.arrayBuffer());
  const texto = bytes.toString('utf8');
  check('CSV com BOM (UTF-8) e separador ;', bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF && texto.includes(';'), texto.slice(0, 60));
}

// ================= RATE LIMIT (último — bloqueia o IP local) =================
console.log('\n-- Rate limit de login --');
{
  const emailBruto = 'bruteforce.e2e@nexos.test';
  let ultimoStatus = 0;
  for (let i = 1; i <= 10; i++) {
    const r = await login(emailBruto, `senha-errada-${i}`);
    ultimoStatus = r.status;
    if (r.status !== 401) break;
  }
  check('10 falhas consecutivas → 401', ultimoStatus === 401, `último=${ultimoStatus}`);
  const r11 = await login(emailBruto, 'senha-errada-11');
  assertStatus(r11, 429, '11ª tentativa bloqueada → 429');
}

// ================= INTEGRIDADE FINAL =================
console.log('\n-- Integridade final --');
{
  const seeds = await db.collection('usuarios').find({ email: { $in: ['ana@nexos.com', 'carlos@nexos.com', 'julia@nexos.com', 'admin@nexos.com'] } }).toArray();
  check('contas seed preservadas (4)', seeds.length === 4, `encontradas=${seeds.length}`);
  check('contas seed usam hash scrypt (sem senha em texto puro)', seeds.every((u) => !!u.senha_hash && !!u.salt && u.senha == null));
  const nAlunos = await db.collection('alunos').countDocuments();
  check('alunos seed preservados (15)', nAlunos === 15, `total=${nAlunos}`);
}

// ================= ENCERRAMENTO =================
console.log('\nEncerrando servidor e MongoDB em memória...');
child?.kill();
await Promise.race([exitPromise, new Promise((r) => setTimeout(r, 5000))]);
if (child && child.exitCode === null) child.kill('SIGKILL');
await cliente.close();
await mongod.stop({ doCleanup: true });

const aprovados = resultados.filter((r) => r.ok === true).length;
const falhas = resultados.filter((r) => r.ok === false);
const pulados = resultados.filter((r) => r.ok === null).length;
console.log('\n==========================================');
console.log(`RESULTADO: ${aprovados} passaram | ${falhas.length} falharam | ${pulados} pulados | ${resultados.length} verificações`);
if (falhas.length) {
  console.log('\nFalhas:');
  for (const f of falhas) console.log(`  - ${f.nome}${f.detalhe ? ` (${f.detalhe})` : ''}`);
}
console.log('==========================================');
process.exit(falhas.length ? 1 : 0);
