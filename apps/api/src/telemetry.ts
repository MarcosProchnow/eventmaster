/**
 * OpenTelemetry (ADR 0010): traces da API e do worker.
 *
 *   node --import ./src/telemetry.ts src/main.ts
 *
 * Só liga quando `OTEL_EXPORTER_OTLP_ENDPOINT` está definido (ex.: http://jaeger:4318).
 * Sem a variável, este arquivo não carrega nada e a aplicação roda como antes.
 * O nome do serviço vem de `OTEL_SERVICE_NAME` (variáveis padrão da especificação).
 */
import { register } from "node:module";

if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
  // O app é ESM: sem este hook, só módulos carregados com `require()` seriam instrumentados.
  // É o hook que a documentação do OpenTelemetry indica; registrado aqui para valer só
  // quando a telemetria está ligada. Precisa vir antes de qualquer import da aplicação.
  register("@opentelemetry/instrumentation/hook.mjs", import.meta.url);

  // Só traces vão para o coletor. Por padrão o NodeSDK também exportaria métricas e logs
  // via OTLP, que o Jaeger não recebe. Os logs continuam no stdout (Pino), com trace_id.
  process.env.OTEL_METRICS_EXPORTER ??= "none";
  process.env.OTEL_LOGS_EXPORTER ??= "none";

  const [{ NodeSDK }, { OTLPTraceExporter }, { HttpInstrumentation }, { PgInstrumentation }, { PinoInstrumentation }, { FastifyOtelInstrumentation }] =
    await Promise.all([
      import("@opentelemetry/sdk-node"),
      import("@opentelemetry/exporter-trace-otlp-http"),
      import("@opentelemetry/instrumentation-http"),
      import("@opentelemetry/instrumentation-pg"),
      import("@opentelemetry/instrumentation-pino"),
      import("@fastify/otel"),
    ]);

  const healthCheck = new Set(["/health", "/ready"]);
  const sdk = new NodeSDK({
    // Lê OTEL_EXPORTER_OTLP_ENDPOINT e envia para <endpoint>/v1/traces.
    traceExporter: new OTLPTraceExporter(),
    instrumentations: [
      // Healthchecks rodam a cada poucos segundos e só gerariam ruído.
      new HttpInstrumentation({ ignoreIncomingRequestHook: (req) => healthCheck.has(req.url ?? "") }),
      // Spans por rota e por hook do Fastify (sucessor oficial de instrumentation-fastify).
      new FastifyOtelInstrumentation({ registerOnInitialization: true }),
      // Uma span por consulta SQL, filha da requisição que a disparou.
      new PgInstrumentation(),
      // Coloca trace_id e span_id em cada linha de log do Pino: log e trace se cruzam.
      new PinoInstrumentation({ disableLogSending: true }),
    ],
  });
  // As spans saem em lote (a cada ~5 s); ao encerrar, as do último lote podem se perder.
  sdk.start();
}
