# Análise de trade-offs

Inspirada no ATAM (Architecture Tradeoff Analysis Method), em versão reduzida para um projeto de uma pessoa: cenários de qualidade com medida, decisões que os afetam, pontos de sensibilidade e de trade-off, riscos e não-riscos. Cada decisão tem o seu ADR; aqui elas são vistas em conjunto.

## Árvore de utilidade (cenários priorizados)
Prioridade = (importância para o negócio, dificuldade técnica), A/M/B.

| Atributo | Cenário (estímulo → resposta medida) | Prioridade | Resultado |
|---|---|---|---|
| Confiabilidade | 50 reservas simultâneas no mesmo tipo de ingresso → nunca vender acima do estoque | (A, A) | ✅ 3.000 reservas em 3 rodadas, estoque vendido = pedidos criados |
| Confiabilidade | Clique duplo ou rede instável repete a reserva → um só pedido | (A, M) | ✅ teste de integração (mesma `Idempotency-Key` → 200 com o mesmo pedido) |
| Confiabilidade | Webhook repetido ou fora de ordem → no máximo uma liquidação | (A, M) | ✅ `decideSettlement` + pagamento `pending` único |
| Confiabilidade | Servidor de e-mail fora do ar → nenhum aviso perdido | (M, M) | ✅ outbox + 5 tentativas com backoff + dead-letter; ⚠️ caminho de falha sem teste de integração |
| Desempenho | 50 reservas simultâneas → p95 < 300 ms (RNF03) | (M, M) | ⚠️ ver medição abaixo |
| Segurança | Usuário tenta ler pedido de outro → não descobre nem que existe | (A, B) | ✅ 404 para não-donos, testado |
| Manutenibilidade | Dev importa o banco dentro do domínio → CI quebra | (M, B) | ✅ dependency-cruiser, regra provada com violações de propósito |
| Modificabilidade | Trocar o gateway sandbox por um real → só um adaptador novo | (M, M) | ✅ porta `PaymentGateway`; nenhum caso de uso conhece o sandbox |
| Implantabilidade | Ambiente completo sobe com um comando → em minutos, igual ao CI | (M, B) | ✅ `docker compose --profile app up` + smoke test no CI |
| Observabilidade | Reserva lenta → achar a consulta SQL culpada | (M, M) | ✅ trace com 14 spans por requisição (HTTP → Fastify → pg) |

## Medição de desempenho da reserva (RNF03)
`node infra/carga/reserva.ts` contra a pilha completa (nginx → API → Postgres) no Codespace de 2 vCPUs e 8 GB, com o gerador de carga na mesma máquina. 1.000 reservas por rodada, depois de 20 de aquecimento.

| Cenário | Vazão | p50 | p95 | p99 | RNF03 |
|---|---|---|---|---|---|
| 50 concorrentes, 1 tipo de ingresso (pior caso, 3 rodadas) | 184–219/s | 203–244 ms | **356–452 ms** | 486–626 ms | ❌ |
| 50 concorrentes, 50 tipos (sem disputa de trava) | 234/s | 205 ms | 255 ms | 359 ms | ✅ |
| 10 concorrentes, 1 tipo | 234/s | 26 ms | 126 ms | 200 ms | ✅ |

**Leitura.** A vazão fica em ~220–234 reservas/s em todos os cenários: o teto é a capacidade do ambiente, não a trava. Com 50 requisições em andamento, a latência média é praticamente a lei de Little (50 ÷ ~230/s ≈ 217 ms). A disputa pela mesma linha (`FOR UPDATE`) não muda a média, mas alonga a cauda: o p95 sobe de 255 para 356–452 ms.

**Hipóteses a investigar** (não verificadas): o pool do `pg` tem 10 conexões (`db/client.ts`), então 40 das 50 requisições esperam conexão; e o gerador de carga divide as mesmas 2 vCPUs com nginx, Node e Postgres. Próximo passo seria medir com o gerador em outra máquina e variar o tamanho do pool.

**Decisão.** Manter o desenho: a meta é atingida com até 10 compras simultâneas no mesmo setor ou com a carga distribuída, e a correção (nunca vender a mais) foi mantida sob carga, que é o requisito de maior prioridade. Para um evento de alta procura ("pior caso"), as alternativas estão abaixo e ficam como evolução.

## Pontos de sensibilidade
Decisões em que um parâmetro muda muito um atributo.
- **Trava pessimista por tipo de ingresso** (ADR 0006): determina a correção do estoque e, ao mesmo tempo, a cauda de latência em evento quente.
- **Tamanho do pool de conexões** (10): limita a concorrência real no banco.
- **Validade da reserva** (15 min): mais tempo = mais conversão e mais estoque "preso" (e maior o efeito da lacuna API6 de [segurança](../seguranca.md)).
- **Intervalo do relay do outbox** (2 s) e do polling da página do pedido (4 s): definem quanto o usuário espera para ver "Pago" e receber o e-mail.

## Pontos de trade-off
Decisões que melhoram um atributo e pioram outro.

| Decisão | Ganha | Perde | Por que ficou assim |
|---|---|---|---|
| Monólito modular (ADR 0001) em vez de microsserviços | Simplicidade, transações locais, deploy único | Escala por módulo, isolamento de falhas, autonomia de times | Uma pessoa, sem tráfego real; fronteiras preparadas para extração ([plano](microsservicos.md)) |
| Trava pessimista (ADR 0006) em vez de otimista ou contador atômico | Correção simples de provar, sem retry na aplicação | Cauda de latência sob disputa | Vender a mais é o pior erro possível no domínio |
| Fila no próprio Postgres (pg-boss, ADR 0007) em vez de Redis/Kafka | Menos infraestrutura; outbox e fila na mesma transação | Fila e transações disputam o mesmo banco | Volume baixo; risco R7 monitorado |
| Cookies `SameSite=Strict` e mesma origem (ADR 0009) | CSRF quase eliminado, sem token no JavaScript | Front e API precisam estar sob o mesmo site; CDN separada exige proxy | Segurança por padrão; o nginx resolve a mesma origem |
| TypeScript executado direto pelo Node 24 | Sem etapa de build na API, imagem simples | Só sintaxe "apagável" (sem `enum`, sem parameter properties) | Ganho de simplicidade maior que a restrição |
| Drizzle (ADR 0005) em vez de Prisma | SQL explícito (`FOR UPDATE`, `SKIP LOCKED`), sem engine binária | Menos abstração, mais SQL na mão | O domínio depende de controle fino de transação |
| Rate limit em memória | Zero infraestrutura | Não vale entre réplicas | Uma instância por enquanto |

## Riscos e não-riscos
**Riscos:**
- Evento de alta procura (pior caso) fora do RNF03 no ambiente medido.
- Reserva sem limite por usuário (API6): permite segurar o estoque.
- Caminho de falha do worker (retries, dead-letter) sem teste de integração.
- Teto de vazão de uma instância ainda não medido fora do Codespace.

**Não-riscos** (decisões verificadas):
- Venda acima do estoque: coberta por trava + `CHECK` + teste de concorrência + carga.
- Cobrança dupla: `Idempotency-Key`, pagamento pendente único, liquidação idempotente.
- Degradação silenciosa da arquitetura: fitness functions no CI.

## Evoluções propostas para o pior caso
1. Medir antes de mudar (gerador fora da máquina, pool de 10 vs 30).
2. Réplicas da API: a regra de estoque está no banco, então funciona sem mudança (rate limit precisaria de armazenamento compartilhado).
3. Reserva por decremento condicional (`UPDATE … SET sold = sold + n WHERE sold + n <= quantity RETURNING`) em vez de `SELECT … FOR UPDATE` + `UPDATE`: uma ida ao banco a menos dentro da trava.
4. Fila de espera virtual para eventos muito disputados, desacoplando o pico do banco.
