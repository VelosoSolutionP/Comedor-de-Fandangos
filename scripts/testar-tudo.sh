#!/usr/bin/env bash
# ============================================================================
#  Roda TODAS as suites do projeto e para na primeira que falhar.
#
#    ./scripts/testar-tudo.sh
#
#  Pre-requisitos: banco no ar, WildFly no ar e o front sendo servido.
#  Com Docker:      docker compose up -d --build
#  Sem Docker:      .\scripts\local-subir.ps1 -Build
#                   node scripts/local-web.js
# ============================================================================
set -uo pipefail

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
LOCAL="$RAIZ/.local"
API="${API:-http://127.0.0.1:8080/api}"
WEB="${WEB:-http://127.0.0.1:8081}"

falhou=0
resumo=()

secao() { echo; echo "=============================================================="; echo " $1"; echo "=============================================================="; }
registrar() {
    if [ "$2" -eq 0 ]; then
        resumo+=("  OK    $1")
    else
        resumo+=("  FALHA $1")
        falhou=1
    fi
}

# ------------------------------------------------------- 1) testes do backend
secao "1/5  JUnit (backend)"
# -f e nao -x: no Windows um .cmd nao tem bit de execucao
if [ -f "$LOCAL/maven/apache-maven-3.9.9/bin/mvn.cmd" ] || command -v mvn >/dev/null 2>&1; then
    if [ -d "$LOCAL/jdk/jdk11" ]; then
        export JAVA_HOME="$LOCAL/jdk/jdk11"
        export PATH="$JAVA_HOME/bin:$LOCAL/maven/apache-maven-3.9.9/bin:$PATH"
        REPO="-Dmaven.repo.local=$LOCAL/m2"
    else
        REPO=""
    fi
    saida=$(cd "$RAIZ/backend" && mvn -B $REPO test -Dtest=DocumentosTest 2>&1)
    rc=$?
    echo "$saida" | grep -E "Tests run:|BUILD" | tail -3
    registrar "JUnit DocumentosTest" "$rc"
else
    resumo+=("  PULOU Maven nao encontrado")
fi

# ------------------------------------------------ 2) validadores do front
secao "2/5  Validadores do front (node, sem dependencia)"
node "$RAIZ/frontend/test/validadores.test.js"
registrar "validadores CPF/CNPJ, mascaras, formulario" $?

# ----------------------------------------------------- 3) procedures do banco
secao "3/5  Smoke das procedures (PostgreSQL)"
PSQL=""
if [ -x "$LOCAL/postgres/pgsql/bin/psql.exe" ]; then
    PSQL="$LOCAL/postgres/pgsql/bin/psql.exe"
elif command -v psql >/dev/null 2>&1; then
    PSQL="psql"
fi
if [ -n "$PSQL" ]; then
    "$PSQL" -h "${PGHOST:-127.0.0.1}" -p "${PGPORT:-5432}" -U "${PGUSER:-fandangos}" \
            -d "${PGDATABASE:-fandangos}" -v ON_ERROR_STOP=1 -q -f "$RAIZ/db/test/smoke.sql"
    registrar "22 checagens de schema/procedures/triggers" $?
else
    resumo+=("  PULOU psql nao encontrado")
fi

# -------------------------------------------------------------- 4) API REST
secao "4/5  Smoke da API REST"
bash "$RAIZ/scripts/smoke-api.sh" "$API"
registrar "34 checagens de endpoint" $?

# ---------------------------------------------------------- 5) e2e do front
secao "5/5  E2E do front (jsdom)"
if [ -d "$LOCAL/jstest/node_modules/jsdom" ]; then
    NODE_PATH="$LOCAL/jstest/node_modules" node "$RAIZ/frontend/test/app.e2e.js" "$WEB"
    registrar "35 checagens de interface" $?
elif node -e "require.resolve('jsdom')" >/dev/null 2>&1; then
    node "$RAIZ/frontend/test/app.e2e.js" "$WEB"
    registrar "35 checagens de interface" $?
else
    resumo+=("  PULOU jsdom nao instalado (npm install jsdom)")
fi

# ------------------------------------------------------------------ resumo
secao "RESUMO"
for l in "${resumo[@]}"; do echo "$l"; done
echo
if [ "$falhou" -ne 0 ]; then
    echo ">>> HA SUITES FALHANDO"
    exit 1
fi
echo ">>> TODAS AS SUITES PASSARAM"
