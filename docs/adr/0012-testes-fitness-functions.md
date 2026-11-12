# 0012. Estratégia de testes e fitness functions

- Status: Aceito
- Data: 2026-11-09 (implementação: 2026-11-12)

## Contexto
Qualidade e fronteiras precisam ser verificadas automaticamente (RNF06). O sistema tem regras que só aparecem com banco real (concorrência do estoque, idempotência), um front que depende da API e uma arquitetura Hexagonal que pode degradar em silêncio com um import errado.

## Alternativas consideradas
1. Só testes manuais.
2. **Pirâmide de testes + regras de arquitetura no CI.**

## Decisão
Unitários nos casos de uso com portas falsas; integração com Postgres real; testes de componente no front com rede simulada; poucos E2E no navegador; regras de dependência checadas por dependency-cruiser no CI.

## Implementação
Versões verificadas no npm em 2026-11-12.

| Camada | Ferramenta | O que cobre | Onde |
|---|---|---|---|
| Unitário (API) | Vitest 5.1 | Regras puras (`planReservation`, `decideSettlement`), casos de uso com portas falsas | `apps/api/test/*-service.test.ts`, `*-domain.test.ts` |
| Integração (API) | Vitest + `app.inject()` + PostgreSQL 17 | HTTP, banco, transações, concorrência, webhook, worker | `apps/api/test/*-http.test.ts`, `worker.test.ts` |
| Componente (front) | Vitest + jsdom 31 + Testing Library 16 + MSW 3 | Telas com as rotas reais, validação, carrinho, `Idempotency-Key`, renovação de sessão | `apps/web/test/` |
| E2E | Playwright 1.65 (Chromium) | Jornada organizador → participante → pagamento → QR code, com API, banco e front reais | `e2e/tests/` |
| Acessibilidade | axe-core (`@axe-core/playwright` 4.14) | WCAG 2.1 A/AA em 9 estados de tela, inclusive com erros de validação; foco do "pular para o conteúdo" | `e2e/` |
| Arquitetura | dependency-cruiser 18.7 | Regras abaixo | `.dependency-cruiser.cjs` |

**Fitness functions** (`pnpm run arch`, falha o CI):
- API: `domain` só importa outros `domain` e `shared` (nem npm, nem `node:*`); `application` não importa `infra`, `http`, `db` nem bibliotecas de infraestrutura; `http` não importa `infra` nem `db` (quem liga as peças é o composition root); `infra` não importa `http`; `shared` não importa módulos; módulos não importam `app.ts`/`main.ts`/`worker`.
- Front: `shared` e `api` não importam `features`/`app`; uma feature não importa outra (exceto `auth`); só `src/api` usa o cliente gerado.
- Geral: sem ciclos e sem import que não resolve. Imports só de tipo contam.

As regras foram provadas com violações de propósito (import de `infra` no domínio, de `infra` numa rota, de uma feature em outra): todas barradas.

**Detalhes que valem registro**
- MSW intercepta no nível da rede: o app usa o mesmo cliente tipado e o mesmo `fetch` de produção. Requisição sem handler é erro (`onUnhandledFrame: "error"`), então cada teste declara toda a rede que usa.
- No E2E o teste faz o papel do gateway: lê o `providerRef` (identificador do lado do gateway, não exposto ao cliente) no banco e envia o webhook assinado com HMAC. A API e o front sobem em portas próprias (3100 e 5174) com segredos só de teste.
- O dependency-cruiser lê TypeScript só até a versão 6; o projeto compila com TS 7. Um TypeScript 5.9 na raiz é ligado a ele por `packageExtensions` (`pnpm-workspace.yaml`). Não afeta a compilação dos apps.

## Desvios do plano
- **Testcontainers: não usado.** Os testes de integração já rodam contra PostgreSQL real (Compose no Codespace, service container no CI) com banco próprio de testes. Testcontainers daria o mesmo com mais uma dependência e Docker dentro do teste. Vale reavaliar se surgir outro serviço (ex.: Redis) ou testes paralelos por banco.
- **Cypress: não usado** (era opcional). Um segundo runner de E2E duplicaria o Playwright sem cobrir nada novo; a comparação fica como texto no README.
- "Módulos só via API pública": as regras garantem as camadas, mas ainda não limitam *quais* arquivos de outro módulo podem ser importados (ex.: `orders/infra` usa `events/infra/ticket-inventory.ts`). Um `index.ts` público por módulo com regra correspondente fica para a Fase 10, junto do plano de extração para microsserviços.

## Consequências
+ Arquitetura não degrada em silêncio; uma mudança de fronteira precisa mudar a regra, o que fica visível no diff.
+ O front é testado contra o contrato real (tipos gerados do OpenAPI) sem subir a API.
- O E2E é o teste mais lento (~20 s) e depende de navegador instalado; por isso cobre só a jornada principal.
- axe pega só parte dos problemas de acessibilidade; teclado e leitor de tela ainda pedem verificação manual.
- O front não mede cobertura; o objetivo é cobrir comportamento, não atingir um número.
