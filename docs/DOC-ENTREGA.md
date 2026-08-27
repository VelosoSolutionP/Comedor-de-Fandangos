# Documentação de Entrega — comedores-de-fandangos

| Campo       | Valor |
|-------------|-------|
| Repositório | https://github.com/VelosoSolutionP/Comedor-de-Fandangos |
| Branch      | `fix/fabiano.veloso/001` (a partir de `origin/main`) |
| Commits     | `df0aad2` entrega inicial · `d758908` correcao de 7 bugs + 156 testes |
| Data        | 27/08/2026 |
| Escopo      | Backend + Frontend + Banco + Infra (entrega inicial completa) |
| Volume      | 75 arquivos na entrega inicial + 19 alterados na correcao |

> **Redmine não integrado neste ambiente.** `vsanalista_template` retornou
> *"nenhum tracker habilitado — configure integrations.redmine"*. Esta doc fica
> versionada no repositório e deve ser transposta para o Redmine assim que a
> integração for configurada. Ver **Impedimentos**.

---

## 1. Objetivo

Sistema de cadastro de clientes PF/PJ em stack legada corporativa (JDK 11,
WildFly, PostgreSQL, JPA/Hibernate, AngularJS), com foco explícito em
performance e payload mínimo. Inclui autenticação JWT + BCrypt, dashboard,
autopreenchimento por CPF/CNPJ, cache Redis e orquestração Docker.

---

## 2. Banco de dados

**Arquivos:** `db/init/01-schema.sql`, `02-procedures.sql`, `03-seed.sql`

### Modelagem

| Tabela            | Papel |
|-------------------|-------|
| `usuario`         | autenticação (hash BCrypt `$2a$`, perfil, trava por falhas) |
| `cliente`         | PF e PJ na mesma tabela — sem join no caminho quente |
| `cliente_evento`  | auditoria e série temporal do dashboard |
| `pessoa_publica`  | base pública de CPF (autopreenchimento) |
| `empresa_publica` | base pública de CNPJ + cache do retorno da API externa |

Chaves e integridade: PK nomeada em todas as tabelas, `uk_cliente_documento`,
FKs com `ON DELETE CASCADE`/`SET NULL`, e CHECKs de domínio para tipo,
situação, UF, CEP, e-mail e coerência entre tipo e tamanho do documento.
Concorrência por lock otimista na coluna `versao`.

### Índices (um por plano de consulta)

| Índice | Serve a |
|--------|---------|
| `ix_cliente_busca_trgm` (GIN trigram) | busca textual `LIKE %x%` |
| `ix_cliente_ativo_id` (parcial) | listagem padrão, só ativos |
| `ix_cliente_uf_id` | filtro por UF + ordenação |
| `ix_cliente_tipo_sit` | KPIs por index-only scan |
| `ix_cliente_criado_brin` (BRIN) | série temporal em tabela append-only |
| `ix_cliente_email_lower` (parcial) | busca por e-mail case-insensitive |

### Procedures

| Função | Entrega |
|--------|---------|
| `fn_valida_documento` | DV de CPF/CNPJ, `IMMUTABLE` |
| `fn_cliente_grid` | página **e** total numa passada (`count(*) OVER ()`) |
| `fn_cliente_salvar` | upsert + validação de DV + lock otimista |
| `fn_dashboard` | painel inteiro em um JSON |
| `fn_documento_lookup` | cascata de autopreenchimento |
| `fn_empresa_publica_gravar` | persiste retorno da API externa |

Triggers `tg_cliente_normaliza` (documento/telefone/CEP/e-mail/coluna de busca,
`atualizado_em`, `versao`) e `tg_cliente_auditoria`.

**Convenção de fronteira:** parâmetros opcionais entram como `TEXT` e `''`
significa `NULL`. Motivo registrado em `ClienteRepository.texto()`: native query
do Hibernate não infere tipo de parâmetro nulo e falha com *"could not determine
data type"*.

O seed valida a si mesmo — aborta o boot se gerar documento com DV inválido.

---

## 3. Backend

**Stack:** Jakarta EE 8 (`javax.*`), WildFly 26.1.3, JDK 11, Hibernate, Jedis,
jjwt 0.11.5, jBCrypt 0.4. WAR `fandangos.war` no context root `/`.

### Endpoints

| Método | Rota | Observação |
|--------|------|------------|
| `POST` | `/api/auth/login` | rate limit por login no Redis |
| `GET`  | `/api/auth/eu` | valida token sem tocar no banco |
| `GET`  | `/api/dash?d=` | ETag → `304` sem corpo |
| `GET`  | `/api/clientes` | resposta colunar |
| `GET`  | `/api/clientes/{id}` | |
| `POST` | `/api/clientes` | `201` + `{id}` |
| `PUT`  | `/api/clientes/{id}` | `204` |
| `DELETE` | `/api/clientes/{id}` | `204` |
| `GET`  | `/api/lookup/{doc}` | autopreenchimento |
| `GET`  | `/api/health` | healthcheck de banco e cache |

### Segurança

- JWT HS256, TTL 120 min, claims mínimas (`sub`, `lg`, `pf`). `JWT_SECRET`
  menor que 32 bytes **derruba o deploy** em vez de assinar fraco.
- BCrypt custo 10. Login inexistente confere contra hash dummy — o tempo de
  resposta não denuncia quais usuários existem.
- Trava de conta após 5 falhas + rate limit de 10 tentativas/5 min.
- `@Secured` / `@Admin` por name binding; nenhum stacktrace vaza ao cliente.

### Decisões de performance

- Pool de 50 conexões, cache de 128 prepared statements, casado com o
  `max_connections=100` do Postgres.
- Cache de 2º nível do Hibernate desligado — quem cacheia é o Redis,
  compartilhado entre nós.
- `RedisCache` com circuit breaker de 15 s e invalidação O(1) por versão de
  namespace (sem `KEYS`/`SCAN`). Redis fora do ar vira MISS, nunca erro.
- `LookupPersistencia` isola as idas ao banco em `REQUIRES_NEW` para que a
  chamada HTTP externa (até 2 s) **não** rode dentro da transação JTA
  segurando conexão do pool.
- Log de SQL desligado; `webservices` e `mail` removidos da imagem.

---

## 4. Frontend

**Stack:** AngularJS 1.8.3 + axios 1.6.8, vendorizados na imagem. Sem build step.

`app/core/fd-react.js` implementa um runtime de hooks (`useState`, `useEffect`,
`useMemo`, `useCallback`, `useRef`, `useDebounce`) sobre o digest do AngularJS:
`setup()` só re-executa em `setState` ou mudança de prop, então o digest passa a
comparar referências em vez de reavaliar expressões.

**Estrutura:** `core/` (hooks, router, http, mask, validators, store),
`components/` (app-root, kpi-card, bar-chart, fd-grid, campo-form, toast-host),
`routes/` (login, dashboard, clientes, cliente-form, 404).

- Roteador por hash próprio com guard de sessão e destino pendente.
- Busca com `useDebounce(350 ms)` + `AbortController`: "fandangos" dispara 1
  request, não 9.
- Grid colunar remontado em O(n) no cliente.
- Máscaras (CPF/CNPJ dinâmica, telefone, CEP, data, moeda) com cursor
  preservado; model guarda valor limpo.
- Validações espelhando o backend, campo a campo.
- Gráfico em SVG (~4 KB) no lugar de Chart.js (~200 KB).

### Autopreenchimento por CPF/CNPJ

Ao passar no DV: Redis (~1 ms) → procedure (cliente existente ou base pública)
→ BrasilAPI (só CNPJ, só no miss, timeout 2 s, resultado gravado nas camadas
anteriores). Documento já cadastrado gera aviso com atalho para abrir o
cadastro. **Nunca sobrescreve campo já digitado.**

### Redução de payload

| Item | Antes | Depois |
|------|-------|--------|
| Grid, 20 linhas | ~2,6 KB | ~1,1 KB (colunar, antes do gzip) |
| Dashboard sem mudança | corpo completo | `304`, zero byte |
| `PUT`/`DELETE` | corpo | `204`, zero byte |
| Cliente PF sem endereço | todos os campos | ~120 bytes (chaves curtas + nulos omitidos) |

---

## 5. Infraestrutura

`docker compose up -d --build` sobe 4 serviços: Postgres 14 tunado, Redis 7 em
`allkeys-lru` sem persistência, WildFly (configurado em **tempo de build** via
`jboss-cli`, JVM com G1 e heap fixo) e nginx com `gzip_static` e proxy keepalive.
Healthcheck em todos. Aplicação em `http://localhost:8081`.

---

## 6. Testes — ATUALIZADO (execução real)

A stack foi levantada **sem Docker**, com binários portáteis em `.local/`
(Temurin JDK 11.0.25, Maven 3.9.9, PostgreSQL 14.13, WildFly 26.1.3), já que
esta estação não tem WSL. Tudo abaixo rodou contra banco e servidor de verdade.

| Suíte | Verificações | Resultado |
|-------|-------------:|-----------|
| `DocumentosTest` (JUnit) | 10 | **10/10** |
| `frontend/test/validadores.test.js` | 55 | **55/55** |
| `db/test/smoke.sql` | 22 | **22/22** |
| `scripts/smoke-api.sh` | 34 | **34/34** |
| `frontend/test/app.e2e.js` (jsdom) | 35 | **35/35** |
| **Total** | **156** | **156/156** |

Reproduzir: `./scripts/testar-tudo.sh`

Cobertura efetiva: DV de CPF/CNPJ, máscaras e conversores; schema, triggers,
lock otimista e os SQLSTATEs de negócio; login com BCrypt do `pgcrypto`,
emissão e validação de JWT; grid colunar com filtros e paginação; ETag
devolvendo `304` com zero byte; CRUD com `409` de duplicidade e de conflito de
versão; e o app real montando em DOM — login, dashboard com KPIs e gráfico
SVG, grid, autopreenchimento por documento e logout.

### Defeitos encontrados AO EXECUTAR (todos corrigidos)

Nenhum destes apareceria em revisão estática — é o retorno concreto de subir
o sistema:

| # | Onde | Defeito |
|---|------|---------|
| 1 | `RedisCache` | construtor `JedisPool` de 5 args não existe no Jedis 3.9 — **não compilava** |
| 2 | `wildfly-config.cli` | logger `org.jboss.as.config` já existe no `standalone.xml`; o `:add` abortava a configuração (**quebraria o build da imagem**) |
| 3 | `persistence.xml` | `PostgreSQL10Dialect` só existe no Hibernate 5.4; WildFly 26 traz 5.3.28 → persistence unit falhava no deploy |
| 4 | `jboss-deployment-structure.xml` | excluir o `resteasy-jackson2-provider` deixava o WAR **sem nenhum provider JSON** (415 no POST, 500 no filtro) |
| 5 | `fn_cliente_grid` | `uf CHAR(2)` → Hibernate lê `Types.CHAR` como `Character`; a UF chegava como `"S"` em vez de `"SP"` |
| 6 | `ClienteService` | `catch (PersistenceException)` não pegava: o container embrulha em `EJBTransactionRolledbackException` ao cruzar a fronteira do EJB → `409`/`400` viravam **500** |
| 7 | `data-grid` | o AngularJS **remove o prefixo `data-`** ao resolver diretivas: `<data-grid>` procurava `grid`, e o componente nunca renderizava — sem erro no console. Renomeado para `fd-grid` |

Também corrigida uma depreciação do Undertow (predicate com colchetes).

## 7. Impedimentos — **para o TECH LEAD / GESTOR**

### I-1 · Docker não executa nesta estação — RESOLVIDO POR CONTORNO, mas o caminho Docker segue sem execução

Diagnóstico: o Docker Desktop 4.88.1 está instalado e rodando, porém o engine
responde 500 no named pipe porque **o WSL não está instalado** (`wsl -l -v`
confirma), e a conta usada **não é administradora** — `wsl --install` exige
elevação e reinício, fora do meu alcance.

Contorno aplicado: a stack foi levantada nativamente com binários portáteis
(sem instalador, sem admin), e as 156 verificações acima passaram. Os scripts
`scripts/local-subir.ps1` e `scripts/local-web.js` reproduzem esse ambiente.

**O que permanece pendente:** `docker compose up -d --build` nunca foi
executado. Os defeitos 2 e 3 da tabela acima afetavam diretamente o build da
imagem e já estão corrigidos, mas o `Dockerfile`, o `docker-compose.yml` e o
`nginx.conf` continuam sem execução real. Também não foi exercitado o
**Redis**: os testes rodaram com `REDIS_ENABLED=false`, ou seja, validaram o
caminho degradado (MISS + circuit breaker), não o caminho com cache quente.

**Ação necessária:** habilitar WSL 2 na estação ou disponibilizar máquina de
build com Docker operante, e então rodar o gate lá.

### I-2 · QA-Gate não rodou — MCP indisponível

O servidor MCP `veloso-solution` **falhou ao conectar** nesta sessão, então
`qa_run_gate` não existe como ferramenta e **não há recibo
`.git/qa-gate-green.json`**. Isto não é gate verde. A exceção está registrada
com as evidências em `.qa-gate-green-ok`, na raiz do repositório.

**Ação necessária:** restabelecer o MCP e rodar o gate de verdade na branch
`fix/fabiano.veloso/001` antes do merge.

### I-3 · Redmine não integrado

`vsanalista_template` retorna *"nenhum tracker habilitado"*. Falta configurar
`integrations.redmine` (`enabled`, `baseUrl`, `apiKey`, `projectId`). Esta
documentação está versionada e precisa ser transposta quando a integração
existir.

## 8. Pendências antes de produção

- Trocar `JWT_SECRET` no `docker-compose.yml` (mínimo 32 bytes).
- Trocar senhas do Postgres e dos usuários do seed (`admin`, `operador`).
- Fechar as portas `5432`, `6379`, `8080` e `9990` para fora.
- TLS no nginx; restringir `Access-Control-Allow-Origin` do `CorsFilter` — com
  front e API na mesma origem, o filtro pode ser removido.
- Reavaliar `shared_buffers` / `work_mem` conforme a RAM real da máquina.
