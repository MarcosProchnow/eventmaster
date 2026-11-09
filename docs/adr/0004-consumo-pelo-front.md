# 0004. Front-end React como SPA com cliente gerado e TanStack Query

- Status: Aceito
- Data: 2026-11-09

## Contexto
Painel autenticado, sem requisito de SEO nem de SSR; API Node separada.

## Alternativas consideradas
1. **Vite SPA + React Router v7 (data mode) + TanStack Query.**
2. Next.js (App Router).
3. React Router em framework mode.

## Decisão
SPA com Vite. Estado de servidor no TanStack Query; estado local com hooks; Context para auth/tema. Next.js pode entrar depois para uma vitrine pública com SEO.

## Consequências
+ Deploy estático e simples; sem duplicar o back-end.
- Sem SEO na vitrine pública enquanto não houver SSR/prerender.
