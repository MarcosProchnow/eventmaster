# EventMaster

Projeto integrado Full Stack e Full Cycle da Pós-Graduação em Desenvolvimento Full Stack e Full Cycle (Arquitetura de Software, React e Node.js). Gestão de eventos: cadastro, ingressos, pagamento, notificações e check-in.

**Status:** Fase 2 (modelo de dados). Veja o [plano do projeto](docs/PLANO-PROJETO.md) e a [documentação](docs/README.md).

## Stack planejada
Node 24 LTS, TypeScript, Fastify, PostgreSQL, Drizzle, React, Vite, TanStack Query. Versões serão fixadas e verificadas ao longo das fases.

## Desenvolvimento
Abra em um GitHub Codespace (o `.devcontainer` prepara Node 24, pnpm e Docker).

## Rodando o banco e os testes
```bash
docker compose up -d --wait
cd apps/api && pnpm install && pnpm test
```
