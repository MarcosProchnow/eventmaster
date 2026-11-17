# EventMaster: documentação de arquitetura (arc42)

Modelo [arc42](https://arc42.org) com as 12 seções. Cada seção é curta e aponta para o artefato detalhado. Estado: fim da Fase 10 (novembro de 2026).

## 1. Introdução e objetivos
Plataforma de gestão de eventos: organizadores publicam eventos e tipos de ingresso; participantes compram, pagam (gateway em **sandbox**, sem dinheiro real) e recebem ingressos com QR code; o sistema avisa por e-mail. Projeto de portfólio da Pós-Graduação em Desenvolvimento Full Stack e Full Cycle, cobrindo Arquitetura de Software, React e Node.js com práticas atuais.

**Objetivos de qualidade** (em ordem):
1. **Correção transacional**: nunca vender acima do estoque nem cobrar duas vezes.
2. **Segurança**: dados de cada usuário isolados; sessão resistente a roubo e CSRF.
3. **Manutenibilidade**: fronteiras de módulo e camadas verificadas automaticamente.
4. **Implantabilidade e observabilidade**: subir tudo com um comando; diagnosticar com traces.

**Partes interessadas:** participante, organizador, avaliador acadêmico/recrutador (lê o código e a documentação), autor (mantém sozinho).

Detalhes: [requisitos](../requisitos/requisitos.md) e [histórias](../requisitos/historias.md).

## 2. Restrições
- Uma pessoa, sem orçamento; pagamento só em sandbox.
- TypeScript em todo o código; Node 24 LTS; PostgreSQL.
- Conteúdo protegido do curso (apostilas, enunciados) fora do repositório.
- Ambiente de desenvolvimento em GitHub Codespaces.

## 3. Contexto e escopo
Atores e sistemas externos no [C4 nível 1](../diagramas/c4.md#nível-1-contexto). Interfaces externas: API REST `/v1` (OpenAPI 3.1 em `apps/api/openapi.json`), webhook do gateway (HMAC), SMTP.

## 4. Estratégia de solução
| Problema | Solução | ADR |
|---|---|---|
| Estilo para uma pessoa, com evolução possível | Monólito modular Hexagonal, um schema por módulo | [0001](../adr/0001-estilo-monolito-modular-hexagonal.md) |
| Contrato front/back sem divergência | Zod → OpenAPI → cliente TypeScript gerado; CI compara | [0003](../adr/0003-contrato-openapi.md), [0004](../adr/0004-consumo-pelo-front.md) |
| Venda concorrente | `SELECT … FOR UPDATE` + `CHECK sold <= quantity` + `Idempotency-Key` | [0006](../adr/0006-concorrencia-estoque.md) |
| Efeitos colaterais confiáveis (e-mail) | Transactional Outbox + pg-boss + dead-letter | [0007](../adr/0007-mensageria-outbox.md) |
| Pagamento trocável e seguro | Porta `PaymentGateway` (Strategy por meio), webhook HMAC, liquidação pura e idempotente | [0008](../adr/0008-pagamento-porta.md) |
| Sessão segura em SPA | JWT curto + refresh rotativo em cookies `HttpOnly; Secure; SameSite=Strict`, mesma origem | [0009](../adr/0009-autenticacao.md) |
| Entrega | Imagens sem root, Compose por perfis, CI com smoke test | [0011](../adr/0011-configuracao-deploy.md) |

## 5. Visão de blocos de construção
[C4 níveis 2 e 3](../diagramas/c4.md) e [visão lógica e de desenvolvimento do 4+1](../diagramas/4mais1.md). Módulos da API: `identity`, `events`, `orders`, `payments`, `notifications`, cada um com `domain`, `application` (casos de uso e portas), `infra` (adaptadores) e `http`. A dependência entre módulos é restrita à `PUBLIC_API` declarada no `.dependency-cruiser.cjs`.

## 6. Visão de tempo de execução
[Sequência de reserva → pagamento → webhook → e-mail](../diagramas/4mais1.md#visão-de-processos-comportamento-em-execução), [componentes do worker](../diagramas/c4.md#nível-3-componentes-do-worker) e [estados do pedido](../diagramas/c4.md#estados-do-pedido).

## 7. Visão de implantação
[Visão física do 4+1](../diagramas/4mais1.md#visão-física-implantação): contêineres `web` (único público), `api`, `worker`, `migrate` e PostgreSQL. Local e CI: `docker compose --profile app`. Produção: [ADR 0014](../adr/0014-hospedagem.md), proposto, aguardando a escolha do provedor.

## 8. Conceitos transversais
- **Erros:** um formato único `{ error: { code, message, details? } }` (`shared/http-schemas.ts`); códigos de domínio mapeados para HTTP no composition root.
- **Validação:** Zod na borda (entrada `strictObject`, saída pelo schema de resposta).
- **Autorização:** papéis + dono do recurso nos casos de uso; 404 para não-donos.
- **Transações:** funções de infra recebem a transação (`Tx`) para operações entre módulos; travas sempre na mesma ordem (por id).
- **Idempotência:** chave do cliente nas reservas; status `pending` no webhook; `outbox_id` único no consumidor.
- **Configuração:** variáveis de ambiente validadas no boot (12-factor).
- **Observabilidade:** logs JSON com `trace_id`, traces OTLP opcionais ([ADR 0010](../adr/0010-observabilidade.md)).
- **Acessibilidade:** componentes com rótulos e papéis ARIA, verificados por axe no E2E.
- **Segurança:** [modelo de ameaças e OWASP API](../seguranca.md).

## 9. Decisões de arquitetura
[Índice dos 14 ADRs](../adr/README.md).

## 10. Requisitos de qualidade e rastreabilidade
Cenários, medições e trade-offs em [análise de trade-offs](../arquitetura/trade-offs.md). Situação de cada requisito:

| Req. | Situação | Evidência |
|---|---|---|
| RF01 Cadastro, login, papéis | ✅ | `auth-*.test.ts`, E2E |
| RF02 Ciclo de vida do evento | ✅ | `events-*.test.ts`, E2E |
| RF03 Tipos de ingresso | ✅ (criar; editar/excluir não) | `events-http.test.ts` |
| RF04 Busca e filtro | ✅ | `events-http.test.ts`, `events.test.tsx` |
| RF05 Reserva e pagamento | ✅ | `orders-http.test.ts`, E2E |
| RF06 Ingresso com QR | ✅ | `order.test.tsx`, E2E |
| RF07 E-mails | ✅ confirmação; lembretes não | `worker.test.ts` |
| RF08 Check-in | ❌ não implementado | — |
| RF09 Cancelamento pelo participante | ❌ não implementado | — |
| RF10 Vendas para o organizador | ❌ não implementado | — |
| RNF01 Sem venda acima do estoque | ✅ | teste de concorrência; carga (3.000 reservas, 0 inconsistências) |
| RNF02 Sem cobrança dupla | ✅ | testes de idempotência e webhook |
| RNF03 p95 < 300 ms com 50 concorrentes | ⚠️ atende com carga distribuída; não no pior caso | `infra/carga/reserva.ts`, [medição](../arquitetura/trade-offs.md#medição-de-desempenho-da-reserva-rnf03) |
| RNF04 Sem BOLA; OWASP API | ✅ | testes de autorização e do limite de reservas por pessoa, [segurança](../seguranca.md) |
| RNF05 LGPD e senha forte | ✅ minimização; ❌ direitos do titular | Argon2id, revisão |
| RNF06 Fronteiras verificadas | ✅ | `pnpm run arch` no CI |
| RNF07 trace-id, `/health`, `/ready` | ✅ | traces verificados no Jaeger |
| RNF08 Acessibilidade | ✅ | axe em 9 estados de tela, teclado |
| RNF09 Um comando | ✅ | job `containers` do CI |
| RNF10 Sem segredos; sandbox | ✅ | gitleaks no CI sobre todo o histórico |

**Números de qualidade:** 94 testes na API, 23 no front, 4 E2E, 13 regras de arquitetura, 219 regras de lint, 0 vulnerabilidades conhecidas em dependências de produção (`pnpm audit`, 12/11/2026).

## 11. Riscos e débitos técnicos
[Registro de riscos (5W2H)](../riscos.md) e lacunas em [segurança](../seguranca.md#lacunas-conhecidas-priorizadas). Os principais débitos:
1. Várias contas contornam o limite de reservas por pessoa (rate limit por IP na reserva, confirmação de e-mail).
2. Desempenho do pior caso (RNF03) e medição fora do Codespace.
3. RF08 a RF10 e lembretes por e-mail.
4. Caminho de falha do worker sem teste de integração.
5. Front sem medição de cobertura; métricas OpenTelemetry não implementadas.
6. Deploy de produção (ADR 0014).

Evolução arquitetural: [plano de extração para microsserviços](../arquitetura/microsservicos.md).

## 12. Glossário
| Termo | Significado |
|---|---|
| Tipo de ingresso | Categoria com preço e quantidade (ex.: Pista, Meia) |
| Reserva | Pedido `reserved`: segura o estoque por 15 min até o pagamento |
| Liquidação | Aplicar o resultado do pagamento: confirmar, cancelar ou estornar |
| Outbox | Tabela onde eventos de domínio são gravados na mesma transação do negócio, para publicação posterior |
| Dead-letter | Fila para onde vão mensagens que falharam em todas as tentativas |
| Porta / adaptador | Interface definida pelo caso de uso / sua implementação concreta (Hexagonal) |
| Fitness function | Teste automatizado de uma característica da arquitetura |
| BOLA | Broken Object Level Authorization: acessar objeto de outro usuário |
| `Idempotency-Key` | Chave enviada pelo cliente para que a repetição de uma requisição não duplique o efeito |
