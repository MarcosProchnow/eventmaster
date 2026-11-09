# 0005. PostgreSQL com um schema por módulo e Drizzle

- Status: Proposto
- Data: 2026-11-09

## Contexto
Domínio relacional e transacional (estoque, pedidos, pagamentos). Precisa de transações e bloqueio de linha.

## Alternativas consideradas
Banco: **PostgreSQL**, MongoDB.
Acesso: **Drizzle**, Prisma 7, Sequelize, `pg` puro.
Critérios: tipagem, proximidade do SQL, migrations, controle de transação.

## Decisão
PostgreSQL, um schema por módulo; acesso por Repository com Drizzle (próximo do SQL, tipagem inferida). A escolha entre Drizzle e Prisma será fechada com matriz ponderada na Fase 2, após verificar as versões atuais.

## Consequências
+ Constraints e transações garantem RNF01.
- Dependência de ferramenta ainda a validar; MongoDB fica fora (possível uso opcional para auditoria).
