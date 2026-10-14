# Relatório Final — Projeto Nexo's

**Data:** 14/10/2026
**Escopo:** Transformar o código-fonte do Nexo's (sistema de gestão escolar) em uma plataforma completa, integrada e segura, preservando o stack original (Next.js 15 App Router, React 18, Tailwind, shadcn/ui, MongoDB driver, Recharts, Gemini 2.5 Flash) e a identidade visual (indigo/violeta, slate, cartões brancos).

## 1. Resultado

- **Autenticação real por sessão** (cookies HttpOnly) substituindo o mock em localStorage.
- **Matriz de permissões de 4 perfis** (ADMIN, COORDENADOR, PROFESSOR, ALUNO) imposta no backend em todas as rotas.
- **Todos os módulos funcionais**: dashboard, alunos, turmas, professores, frequência, desempenho/notas, documentos (GridFS), alertas automáticos, comunicados, relatórios (tabela + CSV), configurações, boletim e Nexo IA.
- **Nexo IA com dados reais e escopados**: o modelo recebe ferramentas do backend e a autorização é revalidada a cada execução — o prompt nunca expande o escopo do perfil.
- **Suíte E2E local e determinística**: 143 verificações (142 PASS / 0 FAIL / 1 SKIP), rodando 100% local com MongoDB em memória.
- **Build de produção verde** e **smoke test de interface**: todas as 15 páginas renderizadas e verificadas em navegador real.

## 2. Segurança e autorização

| Requisito | Implementação |
|---|---|
| Sessão | Cookie `nexos_sessao` HttpOnly, SameSite=Lax, Secure em produção, expiração 8h, token aleatório com hash sha256 no banco (`sessoes`) |
| Senhas | `crypto.scrypt` (N=16384, r=8, p=1, 64 bytes) + salt aleatório, comparação `timingSafeEqual`; migração automática de senhas legadas em texto puro no login |
| Login | Rate limit: 10 falhas/15 min por e-mail **ou** IP (`tentativas_login`); sucesso limpa as falhas; respostas nunca expõem senha/hash/salt |
| Sessão | Validada em todas as rotas protegidas; logout encerra a sessão; `senha_temporaria` forçada no primeiro acesso (alteração sem `senha_atual`) |
| ADMIN | Único perfil que cria contas de ALUNO e redefine senhas de terceiros (COORDENADOR → 403 no backend, mesmo sem a UI) |
| Conta de aluno | ADMIN informa matrícula + e-mail; validação de duplicidade de matrícula **e** e-mail (409); credencial temporária devolvida uma única vez na resposta da criação (nunca em logs/URLs/erros) |
| PROFESSOR | Dados individuais apenas das suas turmas (turma alheia → 403 em alunos, notas, frequência, alertas, relatórios, documentos, comunicados); agregados institucionais permitidos sem nenhum dado individual |
| ALUNO | Apenas os próprios dados; sem alertas internos, sem relatórios institucionais, sem dados de colegas (403) |
| Nexo IA | Ferramentas por perfil no backend; gate de perfil revalidado a cada execução (mesmo se o modelo pedir ferramenta de outro perfil → 403); agregados sem matrículas/nomes individuais; histórico de chat isolado por usuário (404 entre usuários) |
| Documentos | Arquivos em GridFS (coleção `documentos_arquivos`), nunca em disco efêmero; acesso validado no backend por escopo; sem URLs públicas permanentes; download binário com bytes idênticos |
| Auditoria | Toda ação sensível registrada em `auditoria` (criação de conta, alteração de senha, notas, alertas, etc.) |

## 3. Regras de negócio centralizadas

- Alertas automáticos: frequência < 75% alta / < 85% média; média < 5 alta / < 6 média / < 7 baixa; alertas manuais preservados; sem duplicatas; regeneráveis (`POST /api/alertas/regenerar`).
- Frequência: upsert por (matrícula, data_aula, disciplina_id) — sem duplicatas; alunos fora da turma ignorados; "sem registros ≠ 100% de presença" (percentual calculado apenas sobre aulas registradas).
- Cálculos (médias, evolução, quedas, percentuais) em funções reutilizáveis (`lib/nexos/metrics.js`) — as mesmas usadas por dashboard, desempenho, relatórios e Nexo IA.
- `contadores` com bootstrap no seed (usuarios=4, turmas=4, atividades=4) — novos registros recebem ids sequenciais sem colisão.

## 4. Arquivos-chave

**Backend** (`lib/nexos/`): `auth.js` (sessão/cookies/permissões), `security.js` (scrypt/tokens), `metrics.js` (cálculos + `proximoId`), `seed-data.js` (seed idempotente + contadores), handlers por módulo (`usuarios`, `alunos`, `turmas`, `notas`/`desempenho`, `frequencia`, `alertas`, `documentos`, `comunicados`, `configuracoes`, `relatorios`, `nexo-ia` + `nexo-ia-chat`).

**Frontend** (`app/`): login, primeiro-acesso, `(main)/` com as 12 páginas autenticadas e `boletim/[matricula]`; cliente `lib/client/api.js` (fetch com tratamento de erros).

**Testes/scripts** (`scripts/`):
- `e2e.mjs` — suíte completa (143 verificações) com mongodb-memory-server + `next start` + seed oficial.
- `alias-register.mjs` — resolução de `@/` para imports diretos do backend nos testes.
- `servidor-local.mjs` — servidor local com MongoDB em memória para smoke test de UI.

## 5. Testes executados

### 5.1 Suíte E2E — `node scripts/e2e.mjs`

**RESULTADO: 142 PASS | 0 FAIL | 1 SKIP (143 verificações)**

Cobertura: integridade do seed (4 contas, 15 alunos, 4 turmas, contadores); guarda estática contra `<SelectItem value="">` (Radix derruba a página); login/logout/sessão (cookie HttpOnly+SameSite, ausência de campos de senha, 401 sem sessão); RBAC completo (ADMIN cria ALUNO com credencial temporária, 409 duplicados, COORDENADOR bloqueado para ALUNO e para redefinir senha); primeiro acesso do aluno (403s nas rotas proibidas, troca de senha sem `senha_atual`, senha antiga invalidada); escopo do professor (turmas 1-2 apenas, 403s em turma 3); frequência em lote sem duplicatas; notas → alertas (aberto → resolvido, manual preservado); documentos GridFS (upload 201/403, download byte a byte, aluno 403); comunicados (rascunho invisível, leitura idempotente, escopo); configurações (permissões por perfil); Nexo IA HTTP (isolamento de conversas) e determinístico (15 verificações de escopo/gate de perfil/prompt); relatórios CSV com BOM UTF-8 e separador `;`; rate limit (11ª tentativa → 429); integridade final (contas seed com hash scrypt preservadas).

**SKIP documentado:** chat com LLM real (streaming SSE) — requer `EMERGENT_LLM_KEY`, ausente no ambiente local. A lógica completa (ferramentas, gate, escopo, sistema de mensagens) foi verificada deterministicamente sem o modelo.

### 5.2 Build de produção

`yarn build` — sucesso (todas as 24 rotas compiladas, ~156s).

### 5.3 Smoke test de interface (navegador real, build de produção)

Todas as páginas renderizaram sem erro com dados reais do seed:
`/login`, `/primeiro-acesso`, `/dashboard`, `/alunos`, `/turmas`, `/professores`, `/frequencia`, `/desempenho`, `/documentos`, `/alertas`, `/comunicados`, `/relatorios`, `/configuracoes`, `/nexo-ia`, `/boletim/NX2025001`.

Verificações funcionais incluíram: login com redirecionamento, dashboard com métricas corretas (15 alunos, 4 turmas, 2 professores, 88% frequência), listagem de alunos, filtros de alertas, seletores de disciplina com nomes reais.

### 5.4 Bugs encontrados e corrigidos durante os testes

| Bug | Sintoma | Correção |
|---|---|---|
| `<SelectItem value="">` (Radix lança exceção no cliente) | Páginas /frequencia, /alertas e /relatorios mostravam "Application error: a client-side exception" | Valores-sentinela (`__todas`/`__todos`) mapeados de volta para vazio na lógica |
| Opções de disciplina vazias em /frequencia (campos `id`/`nome` inexistentes em `porDisciplina`) | Dropdown sem nomes | Uso de `disciplina_id`/`disciplina` (mesmos campos do backend) |
| Colisão de ids nos `contadores` (seed sem contadores) | Novos registros sobrescreviam ids do seed | Bootstrap de contadores no seed + fallback no `proximoId` |
| PROFESSOR via `/frequencia/resumo` via todas as turmas (mesmo com `turma_id`) | Escopo ampliado indevidamente | Filtro por `turma_id` quando informado |
| Conta de ALUNO sem `turma_id` | Comunicados/documentos da turma não apareciam para o aluno | Vinculação à turma na criação + enriquecimento na sessão |
| `ReferenceError` no handler de usuários (const de bloco) | 500 em todo POST /api/usuarios | Hoisting da variável para o escopo da função |
| BOM do CSV não verificável via `Response.text()` | Falso negativo no teste | Verificação dos bytes brutos (EF BB BF) |

## 6. Pendências

1. **Verificação do chat com LLM real na produção** — configurar `EMERGENT_LLM_KEY` no ambiente Vercel e testar uma conversa real no /nexo-ia (a suíte cobre toda a lógica determinística; falta apenas a chamada ao modelo).
2. **Redeploy da aplicação** — o deploy atual (nexos-school.vercel.app) ainda executa o código antigo. Após o redeploy: novo login de cada conta seed (as senhas são migradas para hash scrypt automaticamente no primeiro login, sem perda de contas) e conferência do /nexo-ia em produção.
3. **Envio da credencial temporária por canal seguro** — a criação de conta de aluno devolve a credencial ao ADMIN na resposta (única vez); o envio ao aluno (e-mail, impressão) fica a cargo da secretaria, pois não há integração de e-mail configurada.

## 7. Como executar

```bash
yarn install
yarn build

# Testes E2E completos (100% local, MongoDB em memória)
node scripts/e2e.mjs

# Servidor local para exploração manual
node scripts/servidor-local.mjs   # http://127.0.0.1:3111
```

**Credenciais do seed:** `admin@nexos.com` (ADMIN), `ana@nexos.com` (COORDENADOR), `carlos@nexos.com` e `julia@nexos.com` (PROFESSOR) — senha `nexos123`. O seed é idempotente (popula apenas banco sem alunos) e nunca destrutivo em inicialização normal.
