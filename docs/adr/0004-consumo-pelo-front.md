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

## Implementação (Fase 7)
Versões verificadas no npm em 2026-11-11: `react` 19.3.1, `vite` 8.3.8, `react-router` 8.5.1, `@tanstack/react-query` 5.107.1, `react-hook-form` 7.92.0, `tailwindcss` 4.3.5, `openapi-typescript` 7.13.0, `openapi-fetch` 0.17.0.

- **Cliente tipado:** o pacote `packages/api-client` gera `schema.d.ts` a partir de `apps/api/openapi.json` e expõe um cliente `openapi-fetch`. O CI falha se o arquivo gerado estiver desatualizado. O gerador exige TypeScript 5, por isso vive em um pacote próprio; o restante do projeto usa TypeScript 7.
- **Mesma origem:** o navegador fala só com o front; o caminho `/v1` é repassado à API (proxy do Vite em desenvolvimento, proxy reverso em produção). Assim os cookies `SameSite=Strict` funcionam e não há CORS (ADR 0009).
- **Sessão:** os tokens ficam em cookies httpOnly. O front só consulta `GET /v1/me`; ao receber 401, renova a sessão uma vez e repete a requisição.
- **Estado:** dados do servidor no TanStack Query (cache, revalidação, polling do pedido enquanto aguarda pagamento); estado de tela com `useState`/`useReducer` (carrinho); busca e paginação na URL. Não há store global: nada no app pediu Redux ou Zustand.
- **Formulários:** React Hook Form + Zod, com as mesmas regras da API. A API continua validando tudo.
- **Rotas protegidas** são conveniência de navegação; a autorização é sempre da API.
- **Estrutura:** por funcionalidade (`features/auth`, `events`, `orders`, `organizer`), com `shared/` e `api/`.

Não adotado nesta fase, por não ser necessário: React Compiler, shadcn/ui (os poucos componentes são próprios, com Tailwind), Next.js/SSR e o modo "data" do React Router (rotas declarativas bastaram). Testes automatizados do front ficam para a Fase 8.
