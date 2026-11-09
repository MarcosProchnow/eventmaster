# 0001. Monólito modular com arquitetura Hexagonal

- Status: Aceito
- Data: 2026-11-09

## Contexto
Projeto de portfólio, equipe de uma pessoa, sem tráfego real. Precisa demonstrar fronteiras bem definidas (RNF06).

## Alternativas consideradas
1. Monólito em camadas simples.
2. **Monólito modular Hexagonal.**
3. Microsserviços.

Critérios: custo operacional, clareza das fronteiras, testabilidade, custo de evolução.

## Decisão
Monólito modular com Ports & Adapters. Módulos: eventos, ingressos, pedidos, pagamentos, usuários, notificações. Cada módulo expõe uma API pública e só conversa com outro por ela ou por eventos de domínio.

## Consequências
+ Deploy e depuração simples; fronteiras explícitas; extração futura de Pagamentos/Notificações possível.
- Escala em bloco; exige disciplina de fronteiras, verificada por fitness functions (ADR 0012).
