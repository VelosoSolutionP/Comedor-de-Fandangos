# Documentação de Entrega — comedores-de-fandangos

| Campo       | Valor |
|-------------|-------|
| Repositório | https://github.com/VelosoSolutionP/Comedor-de-Fandangos |
| Branch      | `main` |
| Commit      | `df0aad2` — *feat: sistema comedores-de-fandangos (JDK 11 + WildFly + Postgres + Redis)* |
| Data        | 27/08/2026 |
| Escopo      | Backend + Frontend + Banco + Infra (entrega inicial completa) |
| Volume      | 75 arquivos, 6.826 linhas |

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
`components/` (app-root, kpi-card, bar-chart, data-grid, campo-form, toast-host),
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

## 6. Testes

| Suíte | Status |
|-------|--------|
| `frontend/test/validadores.test.js` — 55 asserts (DV de CPF/CNPJ, máscaras, conversores, regras de formulário) | **executado, 55/55 verdes** |
| `backend/.../DocumentosTest.java` — 9 casos JUnit | **escrito, NÃO executado** (ver impedimento I-1) |

Verificações estáticas executadas:

- 19 arquivos JS — `node --check`, todos válidos.
- 35 arquivos Java — delimitadores balanceados, `package` coerente com o
  diretório, nome do tipo coerente com o arquivo.
- `docker-compose.yml` — YAML válido, 4 serviços.
- SQL — dollar-quotes balanceadas nos 3 scripts.

---

## 7. Impedimentos — **para o TECH LEAD / GESTOR**

### I-1 · QA-Gate NÃO fechou em verde — ambiente sem Docker funcional

**Não existe recibo `.git/qa-gate-green.json`. O gate não rodou.**

Causa verificada nesta máquina:

```
docker info      -> cliente OK (29.7.2), engine responde 500 no
                    named pipe dockerDesktopLinuxEngine
wsl -l -v        -> "O Subsistema do Windows para Linux não está instalado"
java, mvn        -> ausentes no PATH
```

O Docker Desktop está instalado em `%LOCALAPPDATA%\Programs\DockerDesktop`, mas
sem WSL o backend Linux não sobe — nenhum container executa. Como o build do
WAR é containerizado (`maven:3.8.7-openjdk-11-slim`) e não há JDK/Maven local,
**não foi possível compilar o backend, executar o JUnit, subir o Postgres nem
validar os endpoints em runtime.**

O que isso significa na prática: schema, procedures, WAR e integração entre os
serviços estão **escritos e revisados estaticamente, porém não exercitados**.

**Ação necessária (fora do meu alcance):** habilitar WSL 2 na estação
(`wsl --install`, exige privilégio administrativo e reinício) ou disponibilizar
uma máquina de build com Docker operante. Feito isso:

```bash
docker compose up -d --build
curl -fsS localhost:8081/api/health
node frontend/test/validadores.test.js
```

### I-2 · Redmine não integrado

`vsanalista_template` retorna *"nenhum tracker habilitado"*. Falta configurar
`integrations.redmine` (`enabled`, `baseUrl`, `apiKey`, `projectId`). Esta
documentação está versionada em `docs/DOC-ENTREGA.md` e precisa ser transposta
para o Redmine quando a integração existir.

---

## 8. Pendências antes de produção

- Trocar `JWT_SECRET` no `docker-compose.yml` (mínimo 32 bytes).
- Trocar senhas do Postgres e dos usuários do seed (`admin`, `operador`).
- Fechar as portas `5432`, `6379`, `8080` e `9990` para fora.
- TLS no nginx; restringir `Access-Control-Allow-Origin` do `CorsFilter` — com
  front e API na mesma origem, o filtro pode ser removido.
- Reavaliar `shared_buffers` / `work_mem` conforme a RAM real da máquina.
