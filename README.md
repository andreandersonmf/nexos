# Nexo's — Sistema de Gestão Escolar

Sistema de gestão escolar com foco em acompanhamento de desempenho, frequência e **prevenção de evasão com IA (Gemini 2.5)**.

## Stack

- **Next.js 15** (App Router) + React 18
- **MongoDB** (via driver oficial `mongodb`)
- **Tailwind CSS** + **shadcn/ui**
- **Recharts** (gráficos)
- **Gemini 2.5 Flash** via `emergentintegrations` (Emergent Universal LLM Key)
- `lucide-react` para ícones

## Rodando localmente

```bash
# 1. Instalar dependências (use yarn para respeitar o lock)
yarn install

# 2. Configurar variáveis — copie .env.example para .env e preencha
cp .env.example .env
# edite .env e coloque sua EMERGENT_LLM_KEY

# 3. Subir o MongoDB (local ou cloud) — ajuste MONGO_URL no .env

# 4. Rodar em dev
yarn dev
# http://localhost:3000
```

**Credenciais de login (seed automático na primeira requisição):**
- `ana@nexos.com` / `nexos123` — Coordenadora
- `carlos@nexos.com` / `nexos123` — Professor
- `admin@nexos.com` / `nexos123` — Admin

## Estrutura

```
app/
├── api/[[...path]]/route.js      # Backend único (todas as rotas /api)
├── login/page.js                  # Tela de login
├── (main)/                        # Rotas autenticadas (shared sidebar)
│   ├── layout.js                  # AuthGuard + Sidebar
│   ├── dashboard/page.js
│   ├── alunos/page.js
│   ├── alunos/[matricula]/page.js
│   ├── turmas/page.js
│   ├── turmas/[id]/page.js
│   ├── desempenho/page.js         # Lançamento de notas
│   ├── alertas/page.js            # Motor de alertas automáticos
│   └── nexo-ia/page.js            # Chat Gemini com streaming SSE
└── boletim/[matricula]/page.js    # Boletim imprimível em PDF

lib/
├── mongodb.js                     # Cliente MongoDB reutilizável
└── nexos/seed-data.js             # Dados iniciais (15 alunos, 4 turmas, etc.)

components/
├── nexos/                         # Componentes específicos (Sidebar, Header, etc.)
└── ui/                            # shadcn/ui
```

## Endpoints principais

| Método | Rota                                  | Descrição                                      |
|--------|---------------------------------------|------------------------------------------------|
| POST   | `/api/auth/login`                     | Login (email + senha)                          |
| GET    | `/api/dashboard`                      | Métricas + alertas prioritários + gráfico      |
| GET    | `/api/alunos?q=`                      | Lista de alunos com busca                      |
| GET    | `/api/alunos/:matricula`              | Detalhe completo (notas, freq, observações)    |
| GET    | `/api/turmas` / `/api/turmas/:id`     | Turmas e detalhe                               |
| GET    | `/api/disciplinas`                    | Lista de disciplinas                           |
| GET    | `/api/notas?turma_id&disciplina_id&bimestre` | Notas por filtro                        |
| POST   | `/api/notas/batch`                    | Upsert de notas (regenera alertas)             |
| GET    | `/api/alertas`                        | Lista todos os alertas                         |
| PATCH  | `/api/alertas/:id`                    | Atualizar status                               |
| POST   | `/api/alertas/regenerar`              | Executar motor de regras                       |
| POST   | `/api/nexo-ia/chat`                   | Chat Gemini (adicione `?stream=true` para SSE) |

## Regras de alertas automáticos

- Frequência `< 75%` → prioridade **alta**
- Frequência `< 85%` → prioridade **média**
- Média geral `< 5` → prioridade **alta**
- Média geral `< 6` → prioridade **média**
- Média geral `< 7` → prioridade **baixa**

## Observações

- O seed roda **automaticamente** na primeira chamada da API (idempotente — só popula se a coleção `alunos` estiver vazia). Para resetar: `POST /api/seed/reset`.
- A `EMERGENT_LLM_KEY` concentra o acesso a Gemini/OpenAI/Claude via proxy Emergent. Se o orçamento esgotar, substitua por outra chave Universal Key no `.env`.
- Autenticação é mock (localStorage) — para produção, migrar para Supabase Auth ou JWT real.
