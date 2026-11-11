# EventMaster

Projeto integrado Full Stack e Full Cycle da Pós-Graduação em Desenvolvimento Full Stack e Full Cycle (Arquitetura de Software, React e Node.js). Gestão de eventos: cadastro, ingressos, pagamento, notificações e check-in.

**Status:** Fase 3 (API de eventos e tipos de ingresso). Veja o [plano do projeto](docs/PLANO-PROJETO.md) e a [documentação](docs/README.md).

## Stack planejada
Node 24 LTS, TypeScript, Fastify, PostgreSQL, Drizzle, React, Vite, TanStack Query. Versões serão fixadas e verificadas ao longo das fases.

## Desenvolvimento
Abra em um GitHub Codespace (o `.devcontainer` prepara Node 24, pnpm e Docker).

## Rodando
```bash
docker compose up -d --wait          # Postgres
pnpm install
cd apps/api
cp .env.example .env                 # ALLOW_DEV_AUTH=true só em desenvolvimento
pnpm run db:migrate && pnpm run db:seed
pnpm run dev                         # API em http://localhost:3000, docs em /docs
pnpm test                            # testes unitários e de integração
```

A autenticação real entra na Fase 4. Até lá, as rotas de escrita usam cabeçalhos de desenvolvimento (`x-dev-user-id`, `x-dev-role`), desligados por padrão.
