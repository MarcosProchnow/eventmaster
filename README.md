# EventMaster

Projeto integrado Full Stack e Full Cycle da Pós-Graduação em Desenvolvimento Full Stack e Full Cycle (Arquitetura de Software, React e Node.js). Gestão de eventos: cadastro, ingressos, pagamento, notificações e check-in.

**Status:** Fase 8 (qualidade: testes do front, E2E, acessibilidade e fitness functions). Veja o [plano do projeto](docs/PLANO-PROJETO.md) e a [documentação](docs/README.md).

## Stack planejada
Node 24 LTS, TypeScript, Fastify, PostgreSQL, Drizzle, React, Vite, TanStack Query. Versões serão fixadas e verificadas ao longo das fases.

## Desenvolvimento
Abra em um GitHub Codespace (o `.devcontainer` prepara Node 24, pnpm e Docker).

## Rodando
```bash
docker compose up -d --wait          # Postgres e Mailpit
pnpm install
cd apps/api
cp .env.example .env                 # preencha JWT_SECRET e WEBHOOK_SECRET
pnpm run db:migrate && pnpm run db:seed
pnpm run dev                         # API em http://localhost:3000, docs em /docs
pnpm run worker                      # em outro terminal: e-mails e expiração de reservas
cd ../web && pnpm run dev            # em outro terminal: front em http://localhost:5173
```

## Testes
```bash
pnpm test                                        # API (unitários + integração com Postgres) e front (componentes com MSW)
pnpm run arch                                    # fitness functions: regras de dependência entre camadas
pnpm --filter @eventmaster/e2e exec playwright install --with-deps chromium   # uma vez
pnpm run e2e                                     # Playwright + axe: sobe API e front sozinho (precisa do Postgres)
```
Estratégia, ferramentas e o que ficou de fora (Testcontainers, Cypress) no [ADR 0012](docs/adr/0012-testes-fitness-functions.md).

A autenticação usa cookies httpOnly (JWT de acesso curto e refresh token rotativo). Detalhes no [ADR 0009](docs/adr/0009-autenticacao.md).

O pagamento usa um gateway **sandbox**: nenhum dinheiro é movimentado. Para simular a confirmação de um pagamento em desenvolvimento:
```bash
pnpm run sandbox:webhook <providerRef> approved   # providerRef está em payments.payments
```
Detalhes nos ADRs [0006](docs/adr/0006-concorrencia-estoque.md) e [0008](docs/adr/0008-pagamento-porta.md).

Os e-mails não saem para a internet em desenvolvimento: o Mailpit os captura e mostra em http://localhost:8025. Detalhes no [ADR 0007](docs/adr/0007-mensageria-outbox.md).

## Estrutura
- `apps/api`: API Node.js (Fastify), worker e migrations.
- `apps/web`: front-end React (Vite). Fala com a API pelo caminho `/v1`, na mesma origem.
- `packages/api-client`: cliente TypeScript gerado do contrato OpenAPI.
- `e2e`: testes de ponta a ponta (Playwright) e de acessibilidade (axe).
- `docs`: requisitos, ADRs, diagramas e riscos.
