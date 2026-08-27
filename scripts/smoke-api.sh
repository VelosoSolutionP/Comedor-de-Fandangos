#!/usr/bin/env bash
# ============================================================================
#  smoke da API - exercita todos os endpoints contra um servidor no ar.
#    ./scripts/smoke-api.sh [base_url]      (padrao: http://127.0.0.1:8080/api)
#  Sai com codigo != 0 na primeira divergencia.
# ============================================================================
set -uo pipefail

B="${1:-http://127.0.0.1:8080/api}"
ok=0
falhas=0

chk() { # chk <descricao> <esperado> <obtido>
    if [ "$2" = "$3" ]; then
        printf '  ok   %-46s %s\n' "$1" "$3"
        ok=$((ok + 1))
    else
        printf '  FALHA %-45s esperado=%s obtido=%s\n' "$1" "$2" "$3"
        falhas=$((falhas + 1))
    fi
}

status() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

echo "== comedores-de-fandangos :: smoke da API em $B =="

# ---------------------------------------------------------------- infra
chk "health responde 200"            200 "$(status "$B/health")"
chk "health diz que o banco esta up" true \
    "$(curl -s "$B/health" | sed 's/.*"db":\([a-z]*\).*/\1/')"

# ------------------------------------------------------------ seguranca
chk "sem token -> 401"               401 "$(status "$B/clientes")"
chk "token invalido -> 401"          401 "$(status -H 'Authorization: Bearer abc.def.ghi' "$B/clientes")"
chk "senha errada -> 401"            401 \
    "$(status -X POST "$B/auth/login" -H 'Content-Type: application/json' -d '{"u":"admin","p":"errada"}')"
chk "usuario inexistente -> 401"     401 \
    "$(status -X POST "$B/auth/login" -H 'Content-Type: application/json' -d '{"u":"ninguem","p":"x"}')"

RESP=$(curl -s -X POST "$B/auth/login" -H 'Content-Type: application/json' \
       -d '{"u":"admin","p":"fandangos@123"}')
T=$(echo "$RESP" | sed 's/.*"t":"\([^"]*\)".*/\1/')
chk "login devolve JWT de 3 partes"  2 "$(echo "$T" | tr -cd '.' | wc -c | tr -d ' ')"
chk "login devolve perfil admin"     9 "$(echo "$RESP" | sed 's/.*"r":\([0-9]*\).*/\1/')"
A="Authorization: Bearer $T"

chk "auth/eu com token -> 200"       200 "$(status -H "$A" "$B/auth/eu")"

# ----------------------------------------------------------------- grid
G=$(curl -s -H "$A" "$B/clientes?sz=3")
chk "grid: cabecalho colunar"        '["id","nm","doc","uf","tp","sit"]' \
    "$(echo "$G" | sed 's/.*"c":\(\[[^]]*\]\).*/\1/')"
chk "grid: 3 linhas pedidas"         2 "$(echo "$G" | grep -o '\],\[' | wc -l | tr -d ' ')"
chk "grid: UF com 2 letras"          2 \
    "$(echo "$G" | sed 's/.*"r":\[\[[0-9]*,"[^"]*","[^"]*","\([^"]*\)".*/\1/' | tr -d '\n' | wc -c | tr -d ' ')"
chk "grid: filtro de UF"             200 "$(status -H "$A" "$B/clientes?uf=SP&sz=5")"
chk "grid: busca textual"            200 "$(status -H "$A" "$B/clientes?q=fandangos&sz=5")"
chk "grid: teto de pagina (sz=9999)" 200 "$(status -H "$A" "$B/clientes?sz=9999")"

# ------------------------------------------------------------ dashboard
curl -s -H "$A" -D /tmp/fdg_h.txt -o /tmp/fdg_d.json "$B/dash?d=30"
ETAG=$(grep -i '^etag:' /tmp/fdg_h.txt | tr -d '\r' | cut -d' ' -f2)
chk "dash: 200 com ETag"             1 "$([ -n "$ETAG" ] && echo 1 || echo 0)"
chk "dash: mesmo ETag -> 304"        304 \
    "$(status -H "$A" -H "If-None-Match: $ETAG" "$B/dash?d=30")"
chk "dash: 304 sem corpo"            0 \
    "$(curl -s -o /dev/null -w '%{size_download}' -H "$A" -H "If-None-Match: $ETAG" "$B/dash?d=30")"

# --------------------------------------------------------------- lookup
chk "lookup doc invalido -> ok:false" false \
    "$(curl -s -H "$A" "$B/lookup/11111111111" | sed 's/.*"ok":\([a-z]*\).*/\1/')"

# ----------------------------------------------------------------- CRUD
DOC=52998224725
curl -s -o /dev/null -X DELETE -H "$A" "$B/clientes/0"   # no-op defensivo

CRIA=$(curl -s -X POST "$B/clientes" -H "$A" -H 'Content-Type: application/json' \
  -d "{\"tp\":\"F\",\"doc\":\"$DOC\",\"nm\":\"Cliente De Smoke\",\"em\":\"smoke@fandangos.dev\",\"tel\":\"11987654321\",\"nasc\":\"1990-08-27\",\"sit\":1,\"cep\":\"01310100\",\"uf\":\"SP\",\"cid\":\"Sao Paulo\",\"lim\":1500.50}")
ID=$(echo "$CRIA" | sed 's/.*"id":\([0-9]*\).*/\1/')
chk "POST cliente devolve id"        1 "$([ -n "$ID" ] && [ "$ID" -gt 0 ] && echo 1 || echo 0)"

chk "POST duplicado -> 409"          409 \
    "$(status -X POST "$B/clientes" -H "$A" -H 'Content-Type: application/json' \
       -d "{\"tp\":\"F\",\"doc\":\"$DOC\",\"nm\":\"Duplicado\"}")"
chk "POST com DV invalido -> 400"    400 \
    "$(status -X POST "$B/clientes" -H "$A" -H 'Content-Type: application/json' \
       -d '{"tp":"F","doc":"52998224724","nm":"Doc Ruim"}')"
chk "POST sem nome -> 400"           400 \
    "$(status -X POST "$B/clientes" -H "$A" -H 'Content-Type: application/json' \
       -d "{\"tp\":\"F\",\"doc\":\"$DOC\",\"nm\":\"x\"}")"
chk "POST e-mail invalido -> 400"    400 \
    "$(status -X POST "$B/clientes" -H "$A" -H 'Content-Type: application/json' \
       -d '{"tp":"F","doc":"39053344705","nm":"Email Ruim","em":"arroba-nenhum"}')"

DET=$(curl -s -H "$A" "$B/clientes/$ID")
chk "GET por id devolve o nome"      "Cliente De Smoke" \
    "$(echo "$DET" | sed 's/.*"nm":"\([^"]*\)".*/\1/')"
chk "GET por id: UF completa"        "SP" "$(echo "$DET" | sed 's/.*"uf":"\([^"]*\)".*/\1/')"
VER=$(echo "$DET" | sed 's/.*"v":\([0-9]*\).*/\1/')

# o JSON da procedure vem do Postgres com espacos ("dup" : true), o do Java
# vem sem. O grep abaixo aceita os dois formatos.
chk "lookup do doc recem-criado: dup" true \
    "$(curl -s -H "$A" "$B/lookup/$DOC" | grep -o '"dup"[[:space:]]*:[[:space:]]*[a-z]*' | grep -o '[a-z]*$')"

chk "PUT -> 204"                     204 \
    "$(status -X PUT "$B/clientes/$ID" -H "$A" -H 'Content-Type: application/json' \
       -d "{\"v\":$VER,\"tp\":\"F\",\"doc\":\"$DOC\",\"nm\":\"Cliente De Smoke Alterado\",\"uf\":\"RJ\",\"sit\":1}")"
chk "PUT com versao velha -> 409"    409 \
    "$(status -X PUT "$B/clientes/$ID" -H "$A" -H 'Content-Type: application/json' \
       -d "{\"v\":$VER,\"tp\":\"F\",\"doc\":\"$DOC\",\"nm\":\"Nao Deve Gravar\",\"sit\":1}")"
chk "alteracao foi aplicada"         "RJ" \
    "$(curl -s -H "$A" "$B/clientes/$ID" | sed 's/.*"uf":"\([^"]*\)".*/\1/')"

chk "GET id inexistente -> 404"      404 "$(status -H "$A" "$B/clientes/99999999")"
chk "DELETE -> 204"                  204 "$(status -X DELETE -H "$A" "$B/clientes/$ID")"
chk "GET apos DELETE -> 404"         404 "$(status -H "$A" "$B/clientes/$ID")"
chk "DELETE de novo -> 404"          404 "$(status -X DELETE -H "$A" "$B/clientes/$ID")"

echo
echo "== $ok ok, $falhas falhas =="
[ "$falhas" -eq 0 ] || exit 1
echo "== SMOKE DA API: TUDO VERDE =="
