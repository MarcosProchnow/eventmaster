# 0007. Transactional Outbox com fila pg-boss

- Status: Proposto
- Data: 2026-11-09

## Contexto
Pedido pago deve gerar e-mail sem perder evento nem enviar duplicado.

## Alternativas consideradas
1. Enviar e-mail na própria requisição.
2. **Outbox + fila sobre o próprio Postgres (pg-boss).**
3. Redis + BullMQ.
4. Kafka.

## Decisão
Gravar o evento de domínio na mesma transação do pedido (outbox); um worker consome, envia o e-mail e faz retry com backoff e dead-letter. pg-boss por não exigir infraestrutura extra; confirmar versão e manutenção antes de fixar.

## Consequências
+ Sem perda de evento; uma infra a menos.
- Menos throughput que Kafka; a fila divide recursos com o banco.
