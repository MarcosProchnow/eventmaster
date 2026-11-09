# 0002. Monorepo com pnpm workspaces

- Status: Aceito
- Data: 2026-11-09

## Contexto
API, front-end e schemas compartilhados evoluem juntos e precisam de um contrato único.

## Alternativas consideradas
1. Repositórios separados.
2. **Monorepo com pnpm workspaces.**
3. Monorepo com Nx/Turborepo.

## Decisão
pnpm workspaces com `apps/api`, `apps/web` e `packages/shared`. Nx/Turborepo só se o tempo de build justificar.

## Consequências
+ Mudanças atômicas entre API e front; um CI.
- Um único repositório mistura ciclos de deploy; cache de build fica manual por enquanto.
