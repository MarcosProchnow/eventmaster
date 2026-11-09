# Registro de riscos (5W2H)

Probabilidade e impacto: B (baixo), M (médio), A (alto). Custo em esforço, pois não há orçamento financeiro.

| # | O quê | Por quê | Onde | Quando | Quem | Como (mitigação) | Quanto | P | I |
|---|---|---|---|---|---|---|---|---|---|
| R1 | Venda acima do estoque | Concorrência na reserva | Módulo de ingressos | Fase 5 | Autor | `FOR UPDATE` + constraint + teste de concorrência (ADR 0006) | 1 dia | M | A |
| R2 | Cobrança duplicada | Webhook ou requisição repetidos | Pagamentos | Fase 5 | Autor | `Idempotency-Key` e webhook idempotente (ADR 0008) | 1 dia | M | A |
| R3 | Vazamento de segredos | Repositório público | Todo o repo | Contínuo | Autor | `.env` fora do Git, scan de segredos no CI, só sandbox | 0,5 dia | M | A |
| R4 | Acesso a dados de outro usuário (BOLA) | Falha de autorização por objeto | API | Fases 4 a 6 | Autor | Checagem de propriedade + testes de autorização | 2 dias | M | A |
| R5 | Versões de ferramentas desatualizadas ou erradas | Pareceres sem fonte oficial | Stack | Início de cada fase | Autor | Verificar versões na documentação oficial e fixar no lockfile | 0,5 dia | A | M |
| R6 | Estouro de escopo | Projeto grande para uma pessoa | Plano | Contínuo | Autor | Entregar por fases; itens opcionais ficam por último | — | A | M |
| R7 | Fila e banco disputam recursos | Outbox no Postgres | Worker | Fase 6 | Autor | Medir; migrar para Redis/BullMQ se necessário | 2 dias | B | M |
| R8 | Custo do Codespace | Uso cobrado na conta | Ambiente | Contínuo | Autor | Parar o Codespace ocioso; timeout de inatividade | — | M | B |
| R9 | Dependência vulnerável | Cadeia de suprimentos npm | Dependências | Contínuo | Autor | Dependabot e `pnpm audit` no CI | 0,5 dia | M | M |
