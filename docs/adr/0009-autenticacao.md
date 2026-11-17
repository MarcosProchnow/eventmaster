# 9. Autenticação com access token curto e refresh rotativo

- Status: Aceito (implementado na Fase 4)
- Data: 2026-11-11

## Contexto
API consumida por uma SPA. Precisa de logout real, papéis (RBAC) e proteção contra roubo de token por XSS e contra CSRF.

## Alternativas consideradas
1. Sessão no servidor (id de sessão em cookie).
2. **JWT de acesso curto + refresh token opaco rotativo, ambos em cookies httpOnly.**
3. Tokens em `localStorage` enviados em `Authorization: Bearer`.

A opção 3 foi rejeitada porque qualquer script na página lê o token. A opção 1 é igualmente defensável; a 2 foi escolhida para demonstrar JWT (ementa) sem abrir mão de revogação.

## Decisão
- **Senha:** Argon2id com o `node:crypto` nativo (19 MiB, 2 passes, 1 thread, sal aleatório de 16 bytes), sem dependência externa. Mínimo de 10 caracteres.
- **Access token:** JWT HS256 de 15 minutos (biblioteca `jose` 6.2.17), com `iss`, `aud`, `sub` e `role`. O algoritmo é fixado na verificação.
- **Refresh token:** valor aleatório opaco de 30 dias. O banco guarda apenas o SHA-256. A cada uso é trocado (rotação); o reuso de um token já trocado encerra todas as sessões do usuário.
- **Cookies:** `httpOnly`, `SameSite=Strict`, `Secure` em produção. O de refresh só é enviado para `/v1/auth`.
- **CSRF:** `SameSite=Strict` e, como segunda barreira, requisições de escrita com cabeçalho `Origin` diferente de `WEB_ORIGIN` são recusadas.
- **Enumeração de contas:** login responde igual para senha errada e e-mail inexistente. O cadastro revela que um e-mail já existe (409); aceito por ora, pois evitar isso exige fluxo de confirmação por e-mail.
- **Força bruta:** limite de 10 tentativas por minuto e por IP em cadastro, login e refresh.
- **RBAC:** papéis `attendee`, `organizer` e `admin`. O cadastro só aceita os dois primeiros. A autorização por objeto fica nos casos de uso.

## Consequências
+ JavaScript da página não lê os tokens; logout e roubo de refresh token são tratáveis.
+ Casos de uso testados com adaptadores falsos; Argon2 e JWT testados à parte.
- `SameSite=Strict` exige que front e API estejam no mesmo site (por exemplo, a API atrás de `/api` no mesmo domínio). O deploy da Fase 9 precisa respeitar isso.
- Mudança de papel só vale quando o access token expira (até 15 minutos).
- O limite de tentativas fica em memória: vale para uma instância e zera ao reiniciar. Com mais instâncias, precisa de armazenamento compartilhado.
- Segredo HS256 único: quem o obtém forja tokens. Fica em variável de ambiente (`JWT_SECRET`, mínimo de 32 caracteres) e a API não sobe sem ele.
- Ainda não há: confirmação de e-mail, recuperação de senha, bloqueio por conta, login social (OAuth2/OIDC) e forma de criar um admin. Ficam como evolução.
- O Argon2 do `node:crypto` é recente no Node; convém confirmar o status de estabilidade na documentação da versão em uso antes de produção.

## Origens extras (17/11/2026)
A checagem de `Origin` compara com `WEB_ORIGIN` e, opcionalmente, com `EXTRA_WEB_ORIGINS` (lista separada por vírgula, normalizada no boot). Em uso normal a lista é vazia. Existe porque, atrás do proxy de portas do GitHub Codespaces, o navegador chega com `Origin` reescrito para `https://localhost:8080` ([ADR 0014](0014-hospedagem.md)). Cada origem extra é uma origem em que se confia para escrever na API: não acrescente nenhuma que não seja do próprio front.

