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
