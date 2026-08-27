# comedores-de-fandangos

Sistema de cadastro de clientes feito no estilo **legado corporativo**, mas
afiado para performance: JDK 11, WildFly, PostgreSQL com procedures, Redis e
um front AngularJS organizado como um projeto React moderno.

```
Navegador  ──►  nginx  ──►  WildFly 26 (JDK 11)  ──►  PostgreSQL 14
                                   │
                                   └──────────────►  Redis 7
```

---

## Subir

```bash
docker compose up -d --build
```

| Serviço          | URL                          |
|------------------|------------------------------|
| Aplicação        | http://localhost:8081        |
| API direta       | http://localhost:8080/api    |
| Console WildFly  | http://localhost:9990        |
| Postgres         | `localhost:5432`             |
| Redis            | `localhost:6379`             |

O primeiro build leva alguns minutos (Maven baixa dependências, WildFly é
configurado via `jboss-cli`). O banco é criado e populado **uma única vez**,
quando o volume `pgdata` nasce: ~2.000 clientes, 400 CNPJs e 400 CPFs em base
pública para o autopreenchimento ter o que encontrar.

### Acessos

| Usuário    | Senha           | Perfil        |
|------------|-----------------|---------------|
| `admin`    | `fandangos@123` | administrador |
| `operador` | `operador@123`  | operador      |

Os hashes são gerados no seed pelo `pgcrypto` (`crypt(..., gen_salt('bf',10))`),
formato `$2a$` — o mesmo que o jBCrypt lê no Java.

---

## O que tem dentro

```
db/init/           schema, procedures e carga (rodam na criação do volume)
backend/           WAR Jakarta EE 8 (javax.*) para WildFly
  src/main/java/br/com/fandangos/
    cache/         Redis com circuit breaker e invalidação O(1)
    domain/        entidades JPA (Cliente, Usuario)
    dto/           payloads de chave curta
    repository/    acesso via procedure
    rest/          recursos JAX-RS
    security/      JWT (HS256) + BCrypt + filtros
    service/       regras de negócio
    util/          validação de CPF/CNPJ sem regex
  docker/          script de configuração do WildFly
frontend/
  app/core/        fd-react (hooks), router, http (axios), máscaras, validações
  app/components/  kpi-card, bar-chart, fd-grid, campo-form, toast, app-root
  app/routes/      login, dashboard, clientes, cliente-form, 404
  test/            validadores (node puro) + e2e do app (jsdom)
db/test/           smoke das procedures
scripts/           smoke da API, roda-tudo, subida local sem Docker
```

---

## Decisões de performance

**Banco**

- Procedures fazem o trabalho: `fn_cliente_grid` devolve página **e** total numa
  única varredura (`count(*) OVER ()`), em vez do `SELECT` + `SELECT COUNT(*)`.
- Busca só com dígitos entra pelo índice único de `documento`; busca textual
  entra pelo GIN trigram sobre uma coluna `busca` denormalizada por trigger.
- `fn_dashboard` devolve os 7 KPIs e os 2 gráficos num JSON só — um round-trip
  para o painel inteiro.
- Índice parcial (`WHERE situacao = 1`) para a listagem padrão e BRIN para as
  séries temporais, que custa uma fração de um btree em tabela append-only.
- Validação de CPF/CNPJ existe também em PL/pgSQL: a API não é a única porta.

**Aplicação**

- Pool de 50 conexões com cache de 128 prepared statements, casado com o
  `max_connections` do Postgres.
- Cache de 2º nível do Hibernate **desligado** de propósito: quem cacheia é o
  Redis, compartilhado entre nós, não a heap de um nó só.
- Redis nunca derruba um request — se cair, vira MISS e um breaker de 15s evita
  pagar timeout de conexão em cada chamada.
- Sessão vive no JWT: request autenticado não toca banco nem Redis.
- BCrypt com custo 10, e um hash dummy é verificado quando o login não existe,
  para o tempo de resposta não denunciar quais usuários existem.

**Payload**

- Grid trafega **colunar**: cabeçalho uma vez, linhas como arrays posicionais.
  Em 20 linhas o corpo cai de ~2,6 KB para ~1,1 KB antes do gzip.
- DTOs com chaves curtas e JSON-B omitindo nulos: um PF sem endereço são
  ~120 bytes.
- Dashboard com ETag → refresh devolve `304` sem corpo enquanto nada mudar.
- `PUT`/`DELETE` respondem `204`, zero byte.
- nginx com `gzip_static`: os `.js`/`.css` já vão comprimidos na imagem.

**Front**

- `fd-react.js` roda `setup()` só quando um `setState` acontece ou uma prop
  muda — o digest do AngularJS passa a comparar referências, não reavaliar
  expressões.
- Busca com `useDebounce(350ms)` + `AbortController`: digitar "fandangos"
  dispara **1** request, não 9.
- `debugInfoEnabled(false)` e `track by` no grid.
- Sem Bootstrap, sem Chart.js, sem webpack. O gráfico é SVG em ~4 KB.

---

## Autopreenchimento por CPF/CNPJ

Assim que o documento digitado passa no dígito verificador, o formulário
consulta `/api/lookup/{doc}`, numa cascata do mais barato para o mais caro:

1. **Redis** (~1 ms, TTL 24 h)
2. **`fn_documento_lookup`** — cliente já cadastrado ou base pública local
3. **BrasilAPI** (só CNPJ, só no miss, timeout de 2 s) — e o resultado é
   gravado nos passos 1 e 2, então cada CNPJ paga a rede uma vez só

Se o documento já for de um cliente, o formulário avisa e oferece abrir o
cadastro em vez de criar um duplicado. O preenchimento **nunca sobrescreve**
campo que o usuário já digitou. Se a API externa cair, o cadastro continua
funcionando manualmente (`LOOKUP_EXTERNO=false` desliga o passo 3).

---

## API

Tudo abaixo de `/api`. Exceto `login` e `health`, exige `Authorization: Bearer`.

| Método   | Rota                     | Retorno                                  |
|----------|--------------------------|------------------------------------------|
| `POST`   | `/auth/login`            | `{t,n,r,e}` — token, nome, perfil, exp    |
| `GET`    | `/auth/eu`               | valida o token sem tocar no banco         |
| `GET`    | `/dash?d=30`             | KPIs + séries (ETag)                      |
| `GET`    | `/clientes?q&uf&sit&pg&sz` | grid colunar                            |
| `GET`    | `/clientes/{id}`         | cadastro completo                         |
| `POST`   | `/clientes`              | `201` + `{id}`                            |
| `PUT`    | `/clientes/{id}`         | `204`                                     |
| `DELETE` | `/clientes/{id}`         | `204`                                     |
| `GET`    | `/lookup/{doc}`          | autopreenchimento                         |
| `GET`    | `/health`                | estado de banco e cache                   |

Erros voltam como `{"e":"mensagem","c":"CODIGO"}`. Códigos estáveis:
`DOC_INVALIDO`, `DOC_DUPLICADO`, `VERSAO_CONFLITO`, `NAO_ENCONTRADO`,
`CREDENCIAL_INVALIDA`, `MUITAS_TENTATIVAS`.

```bash
TOKEN=$(curl -s localhost:8081/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"u":"admin","p":"fandangos@123"}' | sed 's/.*"t":"\([^"]*\)".*/\1/')

curl -s localhost:8081/api/dash -H "Authorization: Bearer $TOKEN"
curl -s 'localhost:8081/api/clientes?q=fandangos&sz=5' -H "Authorization: Bearer $TOKEN"
curl -s localhost:8081/api/lookup/52998224725 -H "Authorization: Bearer $TOKEN"
```

---

## Testes

Cinco suítes, **156 verificações**, todas executadas contra banco e servidor
de verdade:

```bash
./scripts/testar-tudo.sh      # roda tudo e para na primeira falha
```

| # | Suíte | O que cobre | Asserts |
|---|-------|-------------|---------|
| 1 | `DocumentosTest` (JUnit) | DV de CPF/CNPJ, repetidos, tamanhos, nulo, máscara | 10 |
| 2 | `frontend/test/validadores.test.js` | validadores e máscaras do front, espelhando o Java | 55 |
| 3 | `db/test/smoke.sql` | schema, procedures, triggers, lock otimista, SQLSTATEs, BCrypt | 22 |
| 4 | `scripts/smoke-api.sh` | todos os endpoints, 401/400/404/409, ETag/304 | 34 |
| 5 | `frontend/test/app.e2e.js` | app real em jsdom: login → dashboard → grid → formulário → logout | 35 |

As suítes 3, 4 e 5 precisam da stack no ar. A 5 precisa de `jsdom`
(`npm install jsdom`; use `NODE_PATH` se instalar fora do projeto).

Individualmente:

```bash
cd backend && mvn test -Dtest=DocumentosTest
node frontend/test/validadores.test.js
psql -U fandangos -d fandangos -v ON_ERROR_STOP=1 -f db/test/smoke.sql
./scripts/smoke-api.sh
NODE_PATH=<dir-do-jsdom> node frontend/test/app.e2e.js
```

## Rodar sem Docker

Em máquina sem WSL/Hyper-V (o Docker Desktop não sobe o engine), dá para
rodar a mesma stack com binários portáteis, sem instalador e sem admin:

```powershell
.\.localaixar.ps1              # JDK 11, Maven, PostgreSQL e WildFly em .local.\scripts\local-subir.ps1 -Build # compila, faz deploy e sobe o WildFly
node scripts\local-web.js        # serve o front e faz o proxy de /api (papel do nginx)
```

O banco precisa ser iniciado e populado uma vez (`initdb`, `pg_ctl start`, e os
três scripts de `db/init` na ordem). O Redis é opcional: com
`REDIS_ENABLED=false` o cache vira MISS e o sistema segue funcionando — é o
mesmo caminho degradado que o circuit breaker usa quando o Redis cai.

---

## Antes de ir para produção

- Trocar `JWT_SECRET` no `docker-compose.yml` (mínimo 32 bytes).
- Trocar as senhas do Postgres e dos usuários do seed.
- Fechar as portas `5432`, `6379`, `8080` e `9990` para fora.
- Colocar TLS no nginx e mudar `Access-Control-Allow-Origin` do `CorsFilter`
  para a origem real (com front e API na mesma origem, dá para removê-lo).
- Reavaliar `shared_buffers`/`work_mem` conforme a RAM real da máquina.
