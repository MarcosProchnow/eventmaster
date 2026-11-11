# EventMaster

Projeto integrado Full Stack e Full Cycle da Pós-Graduação em Desenvolvimento Full Stack e Full Cycle (Arquitetura de Software, React e Node.js). Gestão de eventos: cadastro, ingressos, pagamento, notificações e check-in.

**Status:** Fase 5 (compra de ingressos e pagamento em sandbox). Veja o [plano do projeto](docs/PLANO-PROJETO.md) e a [documentação](docs/README.md).

## Stack planejada
Node 24 LTS, TypeScript, Fastify, PostgreSQL, Drizzle, React, Vite, TanStack Query. Versões serão fixadas e verificadas ao longo das fases.

## Desenvolvimento
Abra em um GitHub Codespace (o `.devcontainer` prepara Node 24, pnpm e Docker).

## Rodando
```bash
docker compose up -d --wait          # Postgres
pnpm install
cd apps/api
cp .env.example .env                 # preencha JWT_SECRET e WEBHOOK_SECRET
pnpm run db:migrate && pnpm run db:seed
pnpm run dev                         # API em http://localhost:3000, docs em /docs
pnpm test                            # testes unitários e de integração
```

A autenticação usa cookies httpOnly (JWT de acesso curto e refresh token rotativo). Detalhes no [ADR 0009](docs/adr/0009-autenticacao.md).

O pagamento usa um gateway **sandbox**: nenhum dinheiro é movimentado. Para simular a confirmação de um pagamento em desenvolvimento:
```bash
pnpm run sandbox:webhook <providerRef> approved   # providerRef está em payments.payments
```
Detalhes nos ADRs [0006](docs/adr/0006-concorrencia-estoque.md) e [0008](docs/adr/0008-pagamento-porta.md).
