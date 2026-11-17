# 0014. Hospedagem de produção

- Status: Parcial (imagens publicadas e demonstração no Codespace; hospedagem contínua ainda não escolhida)
- Data: 2026-11-12

## Contexto
As imagens e o Compose estão prontos e testados no CI (ADR 0011). Falta onde rodar. O que a arquitetura exige do ambiente:

1. **Uma única origem pública** para front e API (cookies `SameSite=Strict`, ADR 0009). A imagem `web` já resolve isso: ela é o único serviço público e repassa `/v1` à API.
2. **Rede privada** entre `web`, `api` e `worker`, com DNS interno (o nginx resolve `API_UPSTREAM`).
3. **Dois processos de longa duração** a partir da mesma imagem: `api` e `worker` (fila pg-boss).
4. **PostgreSQL gerenciado** (backups e atualizações fora da nossa conta) e uma tarefa de migração antes de cada deploy (`node src/db/migrate.ts`).
5. **HTTPS** terminado na plataforma (os cookies são `Secure` com `NODE_ENV=production`).
6. **Segredos** como variáveis de ambiente da plataforma (`JWT_SECRET`, `WEBHOOK_SECRET`, `DATABASE_URL`, `SMTP_URL`).
7. Um serviço de e-mail transacional real no lugar do Mailpit.

## Alternativas consideradas
| Forma | Exemplos (a verificar preço e limites) | Prós | Contras |
|---|---|---|---|
| **Plataforma de contêineres gerenciada** | Fly.io, Render, Railway, Google Cloud Run, Azure Container Apps | Usa as imagens prontas; HTTPS e deploy por imagem; Postgres gerenciado disponível na maioria | Cada uma tem seu jeito de rede privada e de processo em segundo plano (o worker não recebe HTTP); escala para zero pode parar o worker |
| VM única com Docker Compose | Qualquer VPS | Igual ao ambiente testado no CI; custo previsível | Backup, TLS, atualizações e monitoramento por nossa conta |
| Front em CDN (Vercel/Netlify) + API separada | — | CDN global para o front | Quebra a mesma origem: exigiria proxy de reescrita na CDN apontando para a API (possível, mas é mais uma peça) ou mudar a estratégia de cookies |
| Kubernetes gerenciado | EKS, GKE, AKS | Padrão de mercado | Desproporcional para um projeto deste tamanho |

## Recomendação
**Plataforma de contêineres gerenciada + Postgres gerenciado**, publicando as imagens no GitHub Container Registry (GHCR) pelo CI a cada push na `main` que passar nos testes. É o caminho com menos operação e que reaproveita tudo o que já foi testado.

Antes de decidir o provedor, verificar na documentação oficial: suporte a processo sem HTTP (worker), rede privada entre serviços, Postgres gerenciado, preço do menor plano que não pare o worker, e região no Brasil (latência e LGPD).

## Demonstração no Codespace (17/11/2026)
Sem custo e sem conta nova, a aplicação completa roda no próprio Codespace: `infra/codespace-demo.sh` sobe a pilha (projeto Compose separado, com volume de dados próprio e o ambiente de desenvolvimento intocado), define a URL pública (links dos e-mails), configura a API para aceitar as origens que o proxy do Codespace entrega (`EXTRA_WEB_ORIGINS`, veja abaixo) e aplica o seed. O subcomando `aprovar <pedido>` faz o papel do gateway sandbox, para completar a compra numa demonstração. Verificado em 17/11/2026 **pela URL pública, de fora do Codespace e num navegador**: cadastro pela interface, sessão mantida ao navegar (cookies `HttpOnly; Secure; SameSite=Strict`), reserva, Pix, aprovação e pedido `paid` com ingresso; origens de outros sites e de outras portas do Codespace recusadas (403).

**Limites da opção (documentação oficial do GitHub):**
- Cota gratuita de conta pessoal: 120 horas de núcleo por mês e 15 GB-mês de armazenamento. A máquina de 2 núcleos consome 2 horas da cota por hora ligada, ou seja, cerca de **60 horas por mês**. Sem forma de pagamento cadastrada, ao esgotar a cota o Codespace deixa de ser criado ou retomado.
- Desliga sozinho após **30 minutos sem atividade** (padrão; configurável de 5 a 240 minutos) e tem vida máxima de **12 horas**. Tráfego HTTP pela porta encaminhada não conta como atividade; só digitação e saída de terminal.
- Quem desligou o Codespace derruba o app: ao voltar, `infra/codespace-demo.sh`. Os contêineres têm `restart: unless-stopped`, mas um Codespace parado não volta sozinho.
- A porta 8080 nasce **privada** e foi tornada **pública** em 17/11/2026, por decisão do dono (`gh codespace ports visibility 8080:public`): qualquer pessoa com a URL pode cadastrar-se e criar dados (fictícios). A 8025 (caixa de e-mails, sem senha) deve continuar privada.
- **Aviso do GitHub:** na primeira visita de cada pessoa o GitHub mostra uma página de alerta ("development port served by someone's codespace") com um botão *Continue*. Não é do app e não dá para removê-la.
- **Armadilha do proxy (corrigida):** o proxy de portas reescreve o `Origin` das requisições vindas da própria URL pública para `localhost:8080`, mantendo o esquema: um navegador em https chega à API como `https://localhost:8080`; de dentro do Codespace chega como `http://localhost:8080`. Com `WEB_ORIGIN` igual à URL pública, todo cadastro e login pelo navegador levava 403 (CSRF, ADR 0009). Testes feitos de dentro do Codespace não mostraram o problema; só testar de fora mostrou. Solução: a API aceita uma lista de origens extras (`EXTRA_WEB_ORIGINS`, usada só na demonstração). Origens de outros sites não são reescritas, então a proteção continua valendo. O comportamento do proxy é observado, não documentado: se mudar, a lista se ajusta sem mexer no código.
- O encaminhamento de portas só é registrado quando um cliente do VS Code (web ou desktop) abre o Codespace; por SSH a porta 8080 não aparece. As portas 8080 e 8025 foram acrescentadas ao `forwardPorts` do `.devcontainer`.
- Atrás do proxy do GitHub, o nginx vê o IP do proxy e o limite de tentativas de login vale para todos juntos (a pendência do IP real, abaixo).
- Conclusão: serve para demonstrar, não para ficar no ar de forma contínua.

## Alternativas gratuitas analisadas (17/11/2026)
O que o projeto exige para ficar no ar de forma contínua: API, worker e front sempre ligados e um PostgreSQL que não expire nem durma. Fontes: documentação oficial onde indicado; o restante vem de sites de comparação e **deve ser conferido na página do provedor antes de decidir**, pois preços e limites mudam.

| Opção | O que a pesquisa encontrou | Atende? |
|---|---|---|
| Render, plano gratuito | Web service dorme após 15 min sem tráfego; Postgres gratuito expira em 30 dias (14 de carência, depois apaga); sem worker gratuito (fontes secundárias) | ❌ falta o worker e o banco duradouro |
| Fly.io | Sem plano gratuito para contas novas; teste de US$ 1 por 7 dias, depois exige cartão ([docs oficiais](https://fly.io/docs/about/pricing/)) | ❌ |
| Koyeb, Postgres gratuito | 5 horas ativas por mês e 1 GB, dorme após cerca de 5 min ([FAQ de preços](https://www.koyeb.com/docs/faqs/pricing)) | ❌ |
| Oracle Cloud, Always Free | Única opção gratuita que roda o Compose completo 24 horas por dia, numa VM. Exige cartão para cadastro; instâncias ociosas podem ser reclamadas; guias de 2026 dizem que a cota ARM caiu pela metade (não confirmado nas [páginas da Oracle](https://docs.oracle.com/en-us/iaas/Content/FreeTier/resourceref.htm)); administração da VM (HTTPS, backup, atualizações) por nossa conta | ⚠️ viável, com ressalvas |
| Codespace | Veja acima | ⚠️ só demonstração |

**Decisão provisória:** usar o Codespace para demonstrar e manter as imagens publicadas. Para hospedagem contínua a opção gratuita que parece servir é uma VM Always Free da Oracle; as demais não atendem ao worker e ao banco. Antes de escolher, conferir o cadastro, os limites atuais e a política de instâncias ociosas diretamente na Oracle. Hospedagem paga de baixo custo (a plataforma gerenciada da tabela inicial) continua sendo a alternativa que menos dá trabalho.

## Imagens publicadas (17/11/2026)
Passo independente do provedor, já feito: o job `publicar` do CI constrói e envia as duas imagens ao GitHub Container Registry a cada push na `main` **depois** de `check`, `e2e`, `containers` e `segredos` passarem (nunca em pull request).

| Imagem | Tags |
|---|---|
| `ghcr.io/marcosprochnow/eventmaster-api` (API, worker e migrations) | `<sha do commit>` e `latest` |
| `ghcr.io/marcosprochnow/eventmaster-web` (nginx + front) | `<sha do commit>` e `latest` |

- Em produção, use a tag do **sha**, não `latest`: ela diz exatamente qual commit está no ar e permite voltar atrás.
- Os pacotes herdam a visibilidade do repositório (privados). Para baixar fora do GitHub é preciso `docker login ghcr.io` com um token pessoal com a permissão `read:packages`; uma plataforma de deploy guarda esse token como segredo.
- Só esse job recebe `packages: write`; os demais continuam só de leitura.
- As imagens não passam por scanner de vulnerabilidades da imagem (apenas `pnpm audit` das dependências). Fica como melhoria.

## Pendências do deploy, independentes do provedor
- **IP real do cliente atrás do balanceador da plataforma.** Hoje o nginx usa o IP de quem o chama; atrás de um balanceador, seria o IP do balanceador, e o rate limit voltaria a ser global. Configurar `set_real_ip_from` com as faixas do balanceador e `real_ip_header X-Forwarded-For` no nginx.
- `WEB_ORIGIN` com a URL pública (HTTPS).
- Backups do Postgres e teste de restauração (Módulo 0: PCN/DR).
- Coletor de traces (OTLP) do provedor ou um serviço externo, apontado por `OTEL_EXPORTER_OTLP_ENDPOINT`.

## Consequências
+ Nenhuma mudança de código para publicar; só configuração.
- Depende de uma conta no provedor escolhido, criada pelo dono do projeto.
