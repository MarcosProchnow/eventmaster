# Histórias de usuário (INVEST) e casos de uso

Formato: *Como [ator], quero [ação], para [valor].* Critérios de aceite em Dado/Quando/Então.

| ID | História | Critérios de aceite (resumo) | Req. |
|---|---|---|---|
| H01 | Como participante, quero me cadastrar e entrar, para comprar ingressos | Dado e-mail novo, quando envio o cadastro, então a conta é criada; e-mail repetido é recusado | RF01 |
| H02 | Como organizador, quero criar um evento em rascunho, para preparar antes de publicar | Título, data futura e local obrigatórios; rascunho não aparece na busca | RF02 |
| H03 | Como organizador, quero definir tipos de ingresso, para vender categorias diferentes | Preço em centavos ≥ 0, quantidade > 0 | RF03 |
| H04 | Como participante, quero buscar eventos por texto, data e cidade, para achar o que me interessa | Resultado paginado; só eventos publicados | RF04 |
| H05 | Como participante, quero reservar ingressos, para garantir minha vaga enquanto pago | Reserva expira em 15 min; não excede o estoque | RF05, RNF01 |
| H06 | Como participante, quero pagar o pedido, para receber meus ingressos | Pagamento aprovado emite ingressos; recusado libera a reserva | RF05, RF06 |
| H07 | Como participante, quero receber e-mail de confirmação, para ter o comprovante | E-mail enviado após pagamento; falha tenta de novo | RF07 |
| H08 | Como organizador, quero fazer check-in pelo código, para controlar a entrada | Código válido faz check-in uma única vez; repetido é recusado | RF08 |
| H09 | Como organizador, quero ver vendas do evento, para acompanhar a bilheteria | Totais por tipo de ingresso | RF10 |

## Caso de uso: Comprar ingressos (fluxo principal)
1. Participante escolhe evento e tipos de ingresso.
2. Sistema cria o pedido, reserva o estoque e define a expiração.
3. Participante inicia o pagamento.
4. Gateway confirma o pagamento (webhook).
5. Sistema emite os ingressos e registra o evento de domínio `PedidoPago`.
6. Worker envia o e-mail de confirmação.

**Alternativos:** estoque insuficiente (recusa na etapa 2); reserva expirada (pedido cancelado, estoque liberado); pagamento recusado (reserva liberada); webhook duplicado (ignorado por idempotência).
