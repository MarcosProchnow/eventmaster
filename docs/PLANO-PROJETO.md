# Plano do projeto integrado: EventMaster

Projeto público no GitHub para demonstrar a Pós-Graduação em Desenvolvimento Full Stack e Full Cycle (Arquitetura de Software, React e Node.js), usando práticas atuais (nov/2026) e não só a ementa dos bootcamps.

Consolidado a partir de três pareceres: arquitetura, back-end Node.js e front-end React. Versões marcadas com **[verificar]** não foram confirmadas em fonte oficial e devem ser conferidas (`npm view <pacote> version`, nodejs.org, docs oficiais) antes de fixar.

## 1. Produto

EventMaster: gestão de eventos. Organizadores criam eventos e tipos de ingresso; participantes compram, pagam e recebem ingressos com QR code; notificações por e-mail; check-in na entrada.

## 2. Decisões principais

| Tema | Decisão | Alternativa rejeitada (e por quê) |
|---|---|---|
| Estilo | Monólito modular Hexagonal em monorepo | Microsserviços: custo operacional sem ganho para equipe de uma pessoa. Extração futura documentada |
| Monorepo | pnpm workspaces (`apps/api`, `apps/web`, `packages/shared`) | Nx/Turborepo: opcional depois |
| Runtime | Node 24 LTS **[verificar se há LTS mais novo]** | — |
| API | Fastify 5 + Zod (`fastify-type-provider-zod`) **[verificar]** | Express: fica como base conceitual e comparação no README |
| Banco | PostgreSQL, um schema por módulo | MongoDB: domínio relacional e transacional |
| Acesso a dados | Drizzle (ADR com matriz contra Prisma 7) **[verificar]** | Sequelize: tipagem fraca |
| Contrato | OpenAPI 3.1, gerado dos schemas Zod, publicado como `openapi.json` | OpenAPI 3.2: só como nota |
| Front | Vite SPA + React Router v7 (data mode) + TanStack Query | Next.js: sem necessidade de SSR no painel autenticado |
| Fila | Transactional Outbox + pg-boss (usa o Postgres) | Redis/BullMQ e Kafka: mais infra sem necessidade |
| Auth | Access JWT curto + refresh rotativo em cookie httpOnly, argon2, RBAC | Token em localStorage |
| Pagamento | Porta de pagamento (Strategy/Factory), sandbox, webhook idempotente | Credenciais reais |
| Observabilidade | Logs estruturados (Pino) + OpenTelemetry | — |

Divergências entre os pareceres, resolvidas: fila (pg-boss em vez de BullMQ) e Redis (fora; rate limit em memória, suficiente para instância única, registrado como limitação).

## 3. Estrutura do repositório

```
eventmaster/
  apps/
    api/src/modules/{events,tickets,orders,payments,users,notifications}/
        domain/ application/ infra/ http/
    web/src/{app,features,shared,api}/
  packages/shared/        # schemas Zod compartilhados
  docs/
    adr/                  # MADR
    arc42/
    diagramas/            # Mermaid: C4 1-3, 4+1, estados, sequência
    requisitos/           # FURPS+, SMART, histórias INVEST
    riscos.md             # 5W2H
    seguranca.md          # STRIDE + checklist OWASP
  compose.yaml
  .github/workflows/
```

Dependência na API: `http -> application -> domain`; adaptadores de `infra` implementam as portas; injeção por construtor num composition root.

## 4. Fases (fluxo Full Cycle)

| Fase | Entregas | Aprendizado demonstrado |
|---|---|---|
| 0. Fundação | Repo, pnpm, ESLint/Prettier, Conventional Commits, CI vazio, README com visão | Git, trunk-based, versionamento semântico |
| 1. Requisitos e arquitetura | FURPS+/SMART, histórias INVEST, casos de uso, 12 ADRs iniciais, C4 1-2, riscos 5W2H | Módulos 1 e 2 de Arquitetura |
| 2. Modelo de dados | Schema Drizzle, migrations, constraint `sold <= quantity`, seed | SQL, modelagem |
| 3. Back-end núcleo | Eventos e tipos de ingresso (CRUD), validação, erros padronizados, OpenAPI, testes unitários | Camadas, REST, Hexagonal |
| 4. Auth | Registro/login/refresh/logout, `GET /me`, RBAC, propriedade do recurso (BOLA) | JWT, segurança |
| 5. Compra | Reserva com `SELECT ... FOR UPDATE` e expiração, `Idempotency-Key`, pagamento via porta, webhook | Concorrência, Strategy/Factory |
| 6. Assíncrono | Outbox, worker pg-boss, e-mail via Mailpit, retry e dead-letter | Orientação a eventos, Observer |
| 7. Front-end | Lista/detalhe, checkout, meus ingressos (QR), painel do organizador, login; cliente gerado do OpenAPI | React, TypeScript, hooks, Context, useReducer |
| 8. Qualidade | Vitest, Testing Library, MSW, Testcontainers, Playwright (+ 1 fluxo em Cypress, opcional), axe, fitness functions (dependency-cruiser) | Testes em todas as camadas |
| 9. Entrega | Dockerfile multi-stage, Compose completo, CI (lint, typecheck, test, build, audit), deploy do front e da API, OpenTelemetry | Containerização, deploy, monitoramento |
| 10. Fechamento | arc42 consolidado, STRIDE, análise de trade-offs, plano de extração para microsserviços, README final | Desafio final de Arquitetura |

Cada fase termina com testes passando, CI verde e documentação atualizada.

## 5. Ementa: o que fica e o que muda

| Ementa | No projeto | Motivo |
|---|---|---|
| Express, Jest, supertest, winston | Fastify, Vitest, `app.inject`, Pino. Express documentado como comparação | Validação e OpenAPI nativos; stack atual |
| `pg` e Sequelize, Mongoose | Drizzle com PostgreSQL. Mongo fora (extensão opcional: log de auditoria) | Domínio relacional |
| GraphQL | Fora da API principal (módulo opcional somente leitura) | REST + OpenAPI cobre o caso |
| JWT simples | Access + refresh em cookie, argon2; OAuth2/OIDC (Google, PKCE) como complemento | Prática atual |
| Create React App, class components, Redux puro, styled-components, Next pages router | Vite, Tailwind v4 + shadcn/ui. ErrorBoundary deliberado. Redux Toolkit em um módulo isolado (carrinho), com justificativa. Seção no README comparando SPA, SSR e SSG | Superados ou em declínio, mas o conceito continua demonstrável |
| `useMemo`/`useCallback` | React Compiler **[verificar]**; um caso medido no Profiler, antes e depois | Menos necessários com o Compiler |
| Camadas, REST, Swagger, Docker, Git, pirâmide de testes, hooks, Context, React Router, TypeScript | Mantidos integralmente | Mantêm valor |

## 6. Mapeamento módulo -> artefato (Arquitetura)

| Módulo | Artefato |
|---|---|
| 0 Cloud | ADR de deploy, nota de custo, estratégia de backup do Postgres |
| 1 Fundamentos | Matrizes de decisão nos ADRs, riscos 5W2H, premissas e restrições |
| 2 Requisitos | FURPS+/SMART, INVEST, casos de uso, C4 1-3, 4+1 |
| 3 Patterns | Hexagonal, Repository, Strategy/Factory, Observer, Template Method, SOLID, DI |
| 4 Arquiteturas atuais | OpenAPI/REST, SPA, 12-factor, eventos (outbox), nota sobre microsserviços e serverless |
| Desafio final | `docs/arc42`, trade-offs e proposta de evolução |

## 7. Qualidade, segurança e entrega

- **Requisitos não funcionais prioritários:** não vender além da capacidade, não cobrar duas vezes (idempotência), resiliência de pagamento e notificação, observabilidade, LGPD (minimização de dados), p95 de reserva abaixo de 300 ms (meta SMART a validar), acessibilidade (WCAG).
- **Segurança:** Helmet, rate limit, CORS com allowlist, Zod `.strict()`, paginação com limite, CORS com credenciais e proteção CSRF (SameSite + header customizado), segredos só por variável de ambiente, Dependabot, `npm audit`, scan de segredos no CI.
- **Testes:** unitários nos casos de uso com portas falsas; integração com Testcontainers; E2E com Playwright; contrato OpenAPI; CI falha se o cliente gerado estiver desatualizado.
- **Entrega:** imagem `node:24-alpine`, usuário não root, healthcheck; Compose com api, worker, postgres, mailpit; front em Vercel ou Netlify com preview por PR.

## 8. Pontos a verificar antes de publicar

- Versões atuais de React, Node (LTS), Fastify, Drizzle, Prisma, Vitest, Zod, Express 5, TanStack Query.
- Status do React Compiler 1.0, do OpenAPI 3.2, do MADR 4.0 e do Next.js 16.
- Funcionamento do Testcontainers no runner do GitHub Actions.
- Sintaxe `C4Context`/`C4Container` do Mermaid no GitHub; se renderizar mal, usar `flowchart`.
- O código dos bootcamps (Python Hexagonal, `react-flash-cards`, API de vendas) não é copiado. Reaproveitam-se apenas o modelo de domínio e as ideias, com código novo.
- Não incluir material protegido do curso (apostilas, enunciados) nem credenciais no repositório.

## 9. Próximo passo sugerido

Fase 0 e Fase 1: criar o repositório local, a estrutura de pastas, o CI inicial e os primeiros ADRs, antes de qualquer código de aplicação.
