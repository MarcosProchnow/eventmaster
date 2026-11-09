# 5. PostgreSQL com um schema por módulo e Drizzle

- Status: Aceito (revisado na Fase 2)
- Data: 2026-11-09

## Contexto
Domínio relacional e transacional (estoque, pedidos, pagamentos). Precisa de transações, bloqueio de linha e constraints que sirvam de última barreira (RNF01, RNF02).

## Alternativas consideradas
Banco: **PostgreSQL**, MongoDB.
Acesso a dados: **Drizzle**, Prisma, Sequelize, `pg` puro.

Versões verificadas no npm em 2026-11-09: `drizzle-orm` 0.45.4 (latest, ainda abaixo de 1.0), `drizzle-kit` 0.31.11, `prisma` 8.0.0-rc.33 (candidata a lançamento, sem versão estável 8 ainda).

| Critério (peso) | Drizzle | Prisma | Sequelize | `pg` puro |
|---|---|---|---|---|
| Proximidade do SQL e controle de transação (3) | 5 | 3 | 3 | 5 |
| Tipagem inferida do schema (3) | 5 | 5 | 2 | 1 |
| Migrations versionadas (2) | 4 | 5 | 3 | 1 |
| Maturidade/estabilidade da versão (2) | 3 | 3 | 4 | 5 |
| Constraints, índices parciais e checks no schema (2) | 4 | 3 | 3 | 5 |
| **Total ponderado (máx. 60)** | **50** | **43** | **35** | **40** |

As notas são julgamento do autor, não medição. Sensibilidade: se o peso da maturidade subir para 4, Drizzle (56) continua à frente de Prisma (49).

## Decisão
PostgreSQL com um schema por módulo (`identity`, `events`, `sales`, `payments`, `notifications`) e Drizzle para acesso e migrations. Referências entre módulos são colunas `uuid` sem chave estrangeira, para preservar a fronteira entre módulos (ADR 0001); a integridade entre módulos fica na aplicação. Dentro de cada módulo há FKs e constraints (`CHECK`, índices únicos, índices parciais).

## Consequências
+ O banco recusa estoque acima da quantidade, e-mail repetido, pedido repetido por `Idempotency-Key` e webhook repetido (testado em `apps/api/test/schema.test.ts`).
+ Migrations em SQL versionado no repositório.
- Drizzle ainda é 0.x, então mudanças incompatíveis são possíveis; a versão fica fixada.
- Sem FK entre módulos, pedidos podem apontar para eventos inexistentes se a aplicação falhar; a camada de aplicação valida.
- Testes de integração usam o Postgres do Compose (ou service container no CI). Testcontainers fica como evolução.
