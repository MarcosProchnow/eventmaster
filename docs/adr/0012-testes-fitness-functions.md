# 0012. Estratégia de testes e fitness functions

- Status: Aceito
- Data: 2026-11-09

## Contexto
Qualidade e fronteiras precisam ser verificadas automaticamente (RNF06).

## Alternativas consideradas
1. Só testes manuais.
2. **Pirâmide de testes + regras de arquitetura no CI.**

## Decisão
Unitários nos casos de uso com portas falsas; integração com Postgres em contêiner; E2E com Playwright. Regras de dependência (domínio não importa infra; módulos só via API pública) checadas por dependency-cruiser no CI.

## Consequências
+ Arquitetura não degrada em silêncio.
- Mantém uma configuração extra de regras.
