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
