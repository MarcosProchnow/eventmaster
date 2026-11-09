# Requisitos do EventMaster

## Atores
- **Participante**: busca eventos, compra e usa ingressos.
- **Organizador**: cria e gerencia eventos, acompanha vendas e faz check-in.
- **Administrador**: modera usuários e eventos.
- **Sistemas externos**: gateway de pagamento (sandbox) e provedor de e-mail.

## Requisitos funcionais (FURPS+: Functionality)
| ID | Requisito | Prioridade |
|---|---|---|
| RF01 | Cadastro, login e logout de usuários, com papéis | Alta |
| RF02 | Organizador cria, edita, publica e cancela eventos | Alta |
| RF03 | Organizador define tipos de ingresso (nome, preço, quantidade) | Alta |
| RF04 | Participante lista, busca e filtra eventos | Alta |
| RF05 | Participante reserva ingressos e paga o pedido | Alta |
| RF06 | Sistema emite ingressos com código/QR após pagamento confirmado | Alta |
| RF07 | Sistema envia e-mail de confirmação e lembretes | Média |
| RF08 | Organizador faz check-in pelo código do ingresso | Média |
| RF09 | Participante cancela pedido dentro da política de reembolso | Baixa |
| RF10 | Organizador vê vendas e inscritos | Média |

## Requisitos não funcionais / arquiteturais (FURPS+ e SMART)
| ID | Categoria | Meta mensurável (SMART) | Como verificar |
|---|---|---|---|
| RNF01 | Confiabilidade | Nunca vender mais ingressos que a quantidade do tipo (0 violações) | Teste de concorrência + constraint no banco |
| RNF02 | Confiabilidade | Pedido repetido com a mesma `Idempotency-Key` não gera segunda cobrança | Teste de integração |
| RNF03 | Desempenho | p95 da reserva < 300 ms com 50 requisições concorrentes (meta inicial, a validar) | Teste de carga simples |
| RNF04 | Segurança | Sem violações de autorização por objeto (BOLA) nos endpoints; checklist OWASP API Top 10 aplicado | Testes de autorização + revisão |
| RNF05 | Segurança/LGPD | Coletar apenas nome e e-mail; senha com hash forte; dado pessoal fora de logs | Revisão + teste |
| RNF06 | Manutenibilidade | Domínio não importa infraestrutura; módulos só usam a API pública um do outro | Fitness function no CI |
| RNF07 | Observabilidade | Toda requisição com trace-id nos logs; endpoints `/health` e `/ready` | Teste + inspeção |
| RNF08 | Usabilidade | Telas principais sem violações críticas de acessibilidade (axe) e navegáveis por teclado | Playwright + axe |
| RNF09 | Portabilidade | Ambiente completo sobe com um comando (`docker compose up`) | CI |
| RNF10 | Restrições | Sem credenciais reais no repositório; pagamento só em sandbox | Scan de segredos no CI |

## Premissas e restrições
- Equipe de uma pessoa; projeto de portfólio, sem tráfego real.
- Pagamento simulado ou sandbox de provedor; sem dinheiro real.
- Instância única da API (escala horizontal fica como evolução).
- Stack: TypeScript em todo o projeto (ver ADRs).

## Arquitetura mínima viável
Eventos + ingressos + pedido com pagamento simulado + autenticação. Notificações assíncronas e check-in vêm depois.
