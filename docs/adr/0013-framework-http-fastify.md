# 13. Fastify como framework HTTP

- Status: Aceito
- Data: 2026-11-11

## Contexto
A API precisa de validação de entrada, serialização de saída e contrato OpenAPI gerados da mesma fonte (ADR 0003). O bootcamp de Node.js ensina Express.

## Alternativas consideradas
Versões verificadas no npm em 2026-11-11: `fastify` 5.12.8, `fastify-type-provider-zod` 7.0.0, `@fastify/swagger` 9.9.3, `zod` 4.6.7.

| Critério (peso) | Fastify | Express 5 |
|---|---|---|
| Validação e serialização por schema (3) | 5 | 2 |
| OpenAPI gerado dos schemas (3) | 5 | 2 |
| Tipagem ponta a ponta com TypeScript (2) | 5 | 3 |
| Testes sem abrir porta (`inject`) (1) | 5 | 4 |
| Familiaridade (ementa do curso) (2) | 2 | 5 |
| **Total ponderado (máx. 55)** | **49** | **32** |

As notas são julgamento do autor. No Express, validação e OpenAPI dependem de bibliotecas extras ligadas à mão.

## Decisão
Fastify com schemas Zod como fonte única de validação, tipos e OpenAPI 3.1. O arquivo `apps/api/openapi.json` é gerado e versionado; o CI falha se estiver desatualizado.

Estrutura por módulo (Hexagonal): `domain` (regras puras), `application` (casos de uso e portas), `infra` (adaptador Drizzle) e `http` (rotas e schemas). É o `controller -> service -> repository` da ementa, com inversão de dependência: o serviço depende da porta, não do Drizzle.

## Consequências
+ Entrada inválida e campos desconhecidos são recusados antes do caso de uso; a resposta só contém campos declarados.
+ Casos de uso testados sem banco, com um repositório em memória.
- Diverge do Express ensinado no curso; os conceitos (rotas, middleware/hooks, tratamento de erros) são os mesmos.
- **Provisório:** a identificação do usuário usa cabeçalhos `x-dev-user-id`/`x-dev-role`, só com `ALLOW_DEV_AUTH=true` e nunca em produção. Não é autenticação e será substituída na Fase 4 (ADR 0009).
