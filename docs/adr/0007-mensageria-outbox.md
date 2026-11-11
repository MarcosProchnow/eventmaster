# 7. Transactional Outbox com fila pg-boss

- Status: Aceito (implementado na Fase 6)
- Data: 2026-11-11

## Contexto
Um pedido pago deve gerar um e-mail de confirmação. A requisição não pode depender do servidor de e-mail, e o evento não pode se perder se o processo cair entre gravar o pedido e avisar o cliente.

## Alternativas consideradas
1. Enviar o e-mail dentro da própria requisição.
2. Outbox lido direto por um processo próprio (retry e agendamento escritos à mão).
3. **Outbox + fila sobre o próprio PostgreSQL (pg-boss).**
4. Outbox + Redis/BullMQ.
5. Kafka.

Versões verificadas no npm em 2026-11-11: `pg-boss` 12.38.2 (publicado na véspera, exige Node >= 22.12), `nodemailer` 10.5.0.

A opção 2 funcionaria para um único tipo de consumidor, mas retry com backoff, dead-letter e agendamento teriam de ser reimplementados. As opções 4 e 5 exigem infraestrutura que este projeto não precisa.

## Decisão
- A mudança de estado e o evento de domínio são gravados na mesma transação, na tabela `notifications.outbox` (Fase 5).
- Um processo separado, o **worker** (`pnpm run worker`), faz três coisas:
  1. **Relay:** a cada 2 s lê os eventos pendentes (`FOR UPDATE SKIP LOCKED`), publica na fila `domain-events` e só então os marca como publicados.
  2. **Consumidor:** envia o e-mail pela porta `Mailer` (adaptador SMTP; Mailpit em desenvolvimento). Falha de envio vira nova tentativa: 5 tentativas com backoff exponencial; depois o evento vai para a fila `domain-events-dead` e a notificação fica marcada como `failed`.
  3. **Agendamento:** a cada minuto expira as reservas vencidas (antes era um `setInterval` dentro da API).
- A entrega é **ao menos uma vez**. A duplicidade é tratada no consumidor: `notifications.outbox_id` é único, e um evento já entregue não gera outro e-mail.

## Consequências
+ A API responde sem esperar o e-mail; servidor de e-mail fora do ar não perde nem atrasa pedidos.
+ Nenhuma infraestrutura além do PostgreSQL.
+ Verificado por teste com o pg-boss real e, manualmente, com API, worker e Mailpit rodando juntos.
- Se o processo cair depois de o servidor SMTP aceitar a mensagem e antes de registrar o envio, o e-mail pode sair duas vezes. Evitar isso exigiria uma chave de idempotência aceita pelo provedor de e-mail.
- A fila divide recursos com o banco da aplicação e tem menos vazão que um broker dedicado. Aceitável para o porte; a troca por outro broker fica isolada no worker.
- A expiração de reservas passa a ter granularidade de um minuto e só acontece com o worker rodando. Sem ele, reservas vencidas continuam segurando estoque (o pagamento delas já é recusado pela API).
- Notificações em `failed` não têm reenvio automático nem alerta; hoje só aparecem no log e na tabela.
- O pg-boss cria e migra o próprio schema (`pgboss`) ao iniciar, fora das migrations do Drizzle.
