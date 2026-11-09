# 0010. Observabilidade com logs estruturados e OpenTelemetry

- Status: Aceito
- Data: 2026-11-09

## Contexto
Precisa correlacionar requisição, banco e worker (RNF07).

## Alternativas consideradas
1. Só logs de texto.
2. **Logs JSON (Pino) + traces e métricas com OpenTelemetry.**

## Decisão
Logs estruturados com trace-id; OpenTelemetry nos traces e métricas. Convenções semânticas HTTP e de banco são estáveis; logs via OTel serão usados só após checar o status do SDK Node.

## Consequências
+ Diagnóstico ponta a ponta.
- Mais configuração inicial.
