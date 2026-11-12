# 0010. Observabilidade com logs estruturados e OpenTelemetry

- Status: Aceito
- Data: 2026-11-09 (implementação: 2026-11-12)

## Contexto
Precisa correlacionar requisição, banco e worker (RNF07).

## Alternativas consideradas
1. Só logs de texto.
2. **Logs JSON (Pino) + traces e métricas com OpenTelemetry.**

## Decisão
Logs estruturados com trace-id; OpenTelemetry nos traces e métricas. Convenções semânticas HTTP e de banco são estáveis; logs via OTel serão usados só após checar o status do SDK Node.

## Implementação
Versões verificadas no npm em 2026-11-12: `@opentelemetry/sdk-node` 0.300.0, `@opentelemetry/instrumentation-http` 0.300.0, `@opentelemetry/instrumentation-pg` 0.77.0, `@opentelemetry/instrumentation-pino` 0.70.0, `@fastify/otel` 1.0.1, `@opentelemetry/api` 1.10.0. Jaeger 2.23.0 como coletor e interface em desenvolvimento.

- `apps/api/src/telemetry.ts`, carregado com `node --import` antes da aplicação (API e worker). **Só liga se `OTEL_EXPORTER_OTLP_ENDPOINT` estiver definido**; sem a variável não carrega nada (testes e `pnpm dev` não mudam).
- O app é ESM: o arquivo registra o hook `@opentelemetry/instrumentation/hook.mjs` (o indicado na documentação de ESM do OpenTelemetry) com `module.register`, para que `pg`, `http` e `pino` importados via `import` sejam instrumentados.
- Instrumentações: HTTP (ignora `/health` e `/ready`), `@fastify/otel` (sucessor oficial do antigo `instrumentation-fastify`, uma span por rota e por hook), `pg` (uma span por consulta) e Pino (injeta `trace_id`/`span_id` em cada linha de log).
- Exportação OTLP/HTTP só de traces. Métricas e logs via OTLP ficam desligados (`OTEL_METRICS_EXPORTER=none`, `OTEL_LOGS_EXPORTER=none` como padrão): o Jaeger não os recebe e os logs já saem no stdout.
- Nomes de serviço por `OTEL_SERVICE_NAME` (`eventmaster-api`, `eventmaster-worker`).

Verificado: uma requisição `GET /v1/events` pelo nginx gera um trace com 14 spans (HTTP → hooks do Fastify → handler → `pg-pool.connect` → `pg.query`), e a linha de log da requisição traz o mesmo `trace_id`. O worker gera traces das consultas do relay e da fila.

**Versões alinhadas de propósito**: `@fastify/otel` 1.0.1 depende de `@opentelemetry/instrumentation ^0.300.0`. Em versão 0.x, `^` trava o minor; misturar com a linha 0.301 instalaria duas cópias da instrumentação. Por isso todo o SDK está na linha 0.300.

## Desvios e limitações
- **Métricas não implementadas.** Ficam para quando houver um backend de métricas (ex.: Prometheus ou um OpenTelemetry Collector); o Jaeger guarda só traces.
- **Logs via OTel não usados**: continuam no stdout, correlacionados por `trace_id` (como previsto na decisão).
- O front não envia traces; a correlação começa no nginx/API.
- As spans saem em lotes a cada ~5 s; as do último lote podem se perder no encerramento do processo.
- `NodeSDK` traz exportadores que não usamos (gRPC, protobuf), o que pesa ~10 MB na imagem. Trocar por `sdk-trace-node` direto reduziria, ao custo de mais código de montagem.

## Consequências
+ Diagnóstico ponta a ponta: de uma linha de log chega-se ao trace e à consulta SQL lenta.
+ Desligado por padrão, sem custo para testes e desenvolvimento.
- Mais dependências e um hook de carregamento ESM, que a própria documentação do OpenTelemetry ainda trata como área em evolução.
