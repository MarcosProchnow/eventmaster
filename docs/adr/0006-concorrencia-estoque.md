# 0006. Controle de concorrência do estoque de ingressos

- Status: Aceito
- Data: 2026-11-09

## Contexto
Duas compras simultâneas não podem exceder a quantidade do tipo de ingresso (RNF01).

## Alternativas consideradas
1. Verificar e gravar sem bloqueio (condição de corrida).
2. Lock otimista com versão.
3. **`SELECT ... FOR UPDATE` em transação, mais constraint `sold <= quantity`.**

## Decisão
Reserva dentro de transação com bloqueio da linha do tipo de ingresso; reserva com expiração (15 min) liberada por job. A constraint do banco é a última barreira.

## Consequências
+ Correção garantida pelo banco.
- Contenção em eventos muito disputados; aceitável para o escopo.

## Implementação (Fase 5)
- A reserva roda em uma transação: bloqueia os tipos de ingresso com `SELECT ... FOR UPDATE` (ordenados por id, para evitar deadlock), valida com a regra pura `planReservation`, soma em `sold` e grava o pedido.
- A constraint `sold <= quantity` continua como última barreira.
- A reserva vale 15 minutos. Uma rotina periódica expira as vencidas com `FOR UPDATE SKIP LOCKED` e devolve o estoque. Hoje é um `setInterval` de 30 s no processo da API; passa para o worker na Fase 6.
- `Idempotency-Key` obrigatória: a mesma chave devolve o pedido existente; com conteúdo diferente é recusada (o hash do pedido fica gravado).
- Verificado por teste: 20 compras simultâneas para 5 vagas resultam em exatamente 5 pedidos.
- Limitação: a contenção é por tipo de ingresso. Para eventos muito disputados, a evolução seria fila de espera ou reserva em memória (Redis).

## Limite de reservas ativas por pessoa (17/11/2026)
Sem limite, uma só pessoa podia reservar o estoque inteiro em sequência e segurá-lo por 15 minutos (OWASP API6, [segurança](../seguranca.md)).

- Regra: no máximo **3 reservas aguardando pagamento por pessoa e evento** (`DEFAULT_MAX_ACTIVE_RESERVATIONS`; `MAX_ACTIVE_RESERVATIONS` altera, usado só no teste de carga). Acima disso, 422 com mensagem explicando. A regra é pura (`planReservation`).
- "Ativa" = `reserved` e ainda não vencida: reserva vencida que o worker ainda não varreu não conta.
- **Concorrência.** Contar e depois inserir não é seguro: 10 requisições simultâneas leriam a mesma contagem e passariam juntas. A transação começa com `pg_advisory_xact_lock` sobre (pessoa, evento), o que serializa só as reservas da mesma pessoa no mesmo evento; outras pessoas não esperam. A trava é solta no fim da transação. Só a reserva a pede, e sempre antes das travas do estoque; nenhum outro caminho espera por ela, então não há ciclo de espera (deadlock).
- **Replay.** Quem esperou a trava e descobre que a `Idempotency-Key` já virou pedido recebe o pedido (200), não o erro de limite. Repetir um pedido existente nunca é bloqueado pelo limite.
- Alternativas descartadas: `CHECK` no banco (não consegue contar outras linhas); gatilho (poderia, mas esconderia uma regra de negócio no banco, fora do domínio testável); limite só na aplicação, sem trava (a corrida é real: o teste falha sem a trava).
- Verificado por teste: 10 reservas simultâneas da mesma pessoa resultam em exatamente 3 pedidos; removendo a trava ou a checagem de replay, o teste correspondente falha.
- Limitação: o limite é por conta. Várias contas ainda seguram 3 reservas cada.

