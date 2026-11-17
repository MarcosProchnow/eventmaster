# EventMaster

Plataforma de gestão de eventos construída de ponta a ponta como projeto integrado da **Pós-Graduação em Desenvolvimento Full Stack e Full Cycle** (bootcamps de Arquitetura de Software, React e Node.js), com práticas atuais em vez de só a ementa.

Organizadores publicam eventos e tipos de ingresso; participantes buscam, reservam, pagam (gateway em **sandbox**, nenhum dinheiro real) e recebem ingressos com QR code; o sistema avisa por e-mail.

[![CI](https://github.com/MarcosProchnow/eventmaster/actions/workflows/ci.yml/badge.svg)](https://github.com/MarcosProchnow/eventmaster/actions/workflows/ci.yml)

## Destaques
- **Não vende acima do estoque nem cobra duas vezes**: trava pessimista com `CHECK` no banco, `Idempotency-Key`, webhook assinado e liquidação idempotente. Verificado com teste de concorrência e 3.000 reservas simultâneas sob carga.
- **Arquitetura que não degrada em silêncio**: monólito modular Hexagonal com 13 regras de dependência checadas no CI, inclusive a API pública entre módulos.
- **Contrato único**: schemas Zod geram o OpenAPI 3.1, que gera o cliente TypeScript do front; o CI falha se divergirem.
- **Sessão segura em SPA**: JWT curto e refresh rotativo em cookies `HttpOnly; Secure; SameSite=Strict`, mesma origem, detecção de reuso de token.
- **Pronto para produção**: imagens sem root, Compose por perfis, smoke test dos contêineres no CI, OpenTelemetry (HTTP → Fastify → SQL num só trace).
- **Documentado como arquitetura de verdade**: arc42, 14 ADRs, C4 até o nível 3, 4+1, STRIDE + OWASP API Top 10, análise de trade-offs com medição e plano de extração para microsserviços.

## Stack
| Camada | Tecnologias |
|---|---|
| API | Node 24 (TypeScript executado direto), Fastify 5, Zod 4, Drizzle, PostgreSQL 17, pg-boss, jose, Argon2id (`node:crypto`) |
| Front | React 19, Vite 8, React Router, TanStack Query, React Hook Form, Tailwind 4 |
| Qualidade | Vitest, Testing Library, MSW, Playwright, axe-core, dependency-cruiser, oxlint, gitleaks |
| Entrega | Docker (multi-stage), nginx, Docker Compose, GitHub Actions, Dependabot, OpenTelemetry + Jaeger |

Versões fixadas e verificadas em cada fase; os motivos de cada escolha estão nos [ADRs](docs/adr/README.md).

## Como rodar
Abra num GitHub Codespace (o `.devcontainer` prepara Node 24, pnpm e Docker) ou tenha Node 24, pnpm e Docker.

**Aplicação completa em contêineres** (igual à produção):
```bash
cp .env.example .env        # gere JWT_SECRET e WEBHOOK_SECRET com: openssl rand -base64 48
docker compose --profile app up -d --build --wait
infra/smoke-test.sh         # http://localhost:8080
```

**Desenvolvimento** (com recarga automática):
```bash
docker compose up -d --wait          # Postgres e Mailpit
pnpm install
cd apps/api && cp .env.example .env  # preencha JWT_SECRET e WEBHOOK_SECRET
pnpm run db:migrate && pnpm run db:seed
pnpm run dev                         # API em http://localhost:3000 (docs em /docs)
pnpm run worker                      # outro terminal: e-mails e expiração de reservas
cd ../web && pnpm run dev            # outro terminal: front em http://localhost:5173
```
Para aprovar um pagamento sandbox: `pnpm run sandbox:webhook <providerRef> approved` (o `providerRef` está em `payments.payments`). E-mails aparecem no Mailpit, em http://localhost:8025.

**Demonstração no Codespace:** `infra/codespace-demo.sh` sobe a aplicação completa e a abre pela porta 8080 (a visibilidade da porta é decisão do dono). Limites e o que ela não é: [ADR 0014](docs/adr/0014-hospedagem.md).

**Imagens:** o CI publica `eventmaster-api` e `eventmaster-web` no GitHub Container Registry a cada push na `main` ([ADR 0014](docs/adr/0014-hospedagem.md)).

**Traces:** descomente `OTEL_EXPORTER_OTLP_ENDPOINT` no `.env`, acrescente `--profile observabilidade` e abra o Jaeger em http://localhost:16686.

## Qualidade
```bash
pnpm run check     # typecheck
pnpm run lint      # oxlint
pnpm test          # API (unitários + integração com Postgres) e front (componentes com MSW)
pnpm run arch      # fitness functions de arquitetura
pnpm run e2e       # Playwright + axe (instale o Chromium uma vez: pnpm --filter @eventmaster/e2e exec playwright install --with-deps chromium)
node infra/carga/reserva.ts   # carga da reserva contra a pilha em contêineres
```
O CI roda tudo isso, mais `pnpm audit`, gitleaks no histórico, conferência do contrato OpenAPI e do cliente gerado, build e smoke test das imagens.

## Mapa da Pós neste projeto
| Bootcamp | Onde está |
|---|---|
| **Arquitetura de Software** | Requisitos FURPS+/SMART e histórias INVEST, riscos 5W2H, 14 ADRs com matrizes de decisão, C4 (níveis 1 a 3), 4+1, Hexagonal, Repository, Strategy, Observer (outbox), arc42, STRIDE, trade-offs, plano de microsserviços |
| **Node.js** | API REST em camadas, validação, tratamento de erros, OpenAPI, JWT e cookies, SQL com transações e travas, processamento assíncrono, testes de unidade e integração, Docker |
| **React** | SPA com TypeScript, hooks, `useReducer` (carrinho), rotas protegidas, formulários com validação, data fetching com cache, acessibilidade, testes com Testing Library e E2E |

Ficaram de fora de propósito, com justificativa nos ADRs: Express (comparado no ADR 0013), Sequelize e Mongoose (ADR 0005), Redux (sem estado global que o justifique, ADR 0004), Next.js (sem necessidade de SSR), Testcontainers e Cypress (ADR 0012).

## Estrutura
```
apps/api            API Fastify, worker e migrations (módulos: identity, events, orders, payments, notifications)
apps/web            front React (features: auth, events, orders, organizer) + nginx
packages/api-client cliente TypeScript gerado do OpenAPI
e2e                 Playwright + axe
infra               init do Postgres, smoke test e teste de carga
docs                arc42, ADRs, diagramas, requisitos, segurança, trade-offs, riscos
```

## Documentação
Comece pelo **[arc42](docs/arc42/README.md)**, que liga tudo. Atalhos: [ADRs](docs/adr/README.md) · [C4](docs/diagramas/c4.md) · [4+1](docs/diagramas/4mais1.md) · [Segurança](docs/seguranca.md) · [Trade-offs e medições](docs/arquitetura/trade-offs.md) · [Microsserviços](docs/arquitetura/microsservicos.md) · [Plano do projeto](docs/PLANO-PROJETO.md).

## Limitações conhecidas
Check-in, cancelamento pelo participante e relatório de vendas não foram implementados; o pior caso de desempenho (50 reservas simultâneas no mesmo setor) ficou acima da meta no ambiente medido; o deploy de produção aguarda a escolha do provedor. Lista completa e priorizada na [seção 11 do arc42](docs/arc42/README.md#11-riscos-e-débitos-técnicos).
