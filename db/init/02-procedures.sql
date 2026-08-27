-- ============================================================================
--  comedores-de-fandangos :: stored procedures
--  Regra: a aplicacao NAO monta SQL dinamico. Ela chama procedure.
--  Beneficio: plano de execucao em cache no PG, 1 round-trip por operacao,
--             payload de saida ja no formato final (JSON/colunar).
-- ============================================================================
SET client_min_messages = WARNING;

-- ---------------------------------------------------------------------------
-- fn_valida_documento : digito verificador de CPF (11) e CNPJ (14)
-- IMMUTABLE -> pode ser usada em CHECK e em indice
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_valida_documento(p_doc TEXT)
RETURNS BOOLEAN AS $fn$
DECLARE
    d    TEXT;
    soma INT;
    peso INT;
    dv1  INT;
    dv2  INT;
    i    INT;
BEGIN
    d := regexp_replace(COALESCE(p_doc,''), '[^0-9]', '', 'g');

    -- rejeita repeticoes (00000000000, 11111111111, ...)
    IF d ~ ('^(.)\1*$') THEN
        RETURN FALSE;
    END IF;

    IF length(d) = 11 THEN                                  -- ---------- CPF
        soma := 0;
        FOR i IN 1..9 LOOP
            soma := soma + substr(d, i, 1)::INT * (11 - i);
        END LOOP;
        dv1 := 11 - (soma % 11);
        IF dv1 >= 10 THEN dv1 := 0; END IF;

        soma := 0;
        FOR i IN 1..10 LOOP
            soma := soma + substr(d, i, 1)::INT * (12 - i);
        END LOOP;
        dv2 := 11 - (soma % 11);
        IF dv2 >= 10 THEN dv2 := 0; END IF;

        RETURN dv1 = substr(d, 10, 1)::INT AND dv2 = substr(d, 11, 1)::INT;

    ELSIF length(d) = 14 THEN                               -- ---------- CNPJ
        soma := 0; peso := 5;
        FOR i IN 1..12 LOOP
            soma := soma + substr(d, i, 1)::INT * peso;
            peso := CASE WHEN peso = 2 THEN 9 ELSE peso - 1 END;
        END LOOP;
        dv1 := soma % 11;
        dv1 := CASE WHEN dv1 < 2 THEN 0 ELSE 11 - dv1 END;

        soma := 0; peso := 6;
        FOR i IN 1..13 LOOP
            soma := soma + substr(d, i, 1)::INT * peso;
            peso := CASE WHEN peso = 2 THEN 9 ELSE peso - 1 END;
        END LOOP;
        dv2 := soma % 11;
        dv2 := CASE WHEN dv2 < 2 THEN 0 ELSE 11 - dv2 END;

        RETURN dv1 = substr(d, 13, 1)::INT AND dv2 = substr(d, 14, 1)::INT;
    END IF;

    RETURN FALSE;
END;
$fn$ LANGUAGE plpgsql IMMUTABLE STRICT;

-- ---------------------------------------------------------------------------
-- fn_cliente_grid : listagem paginada + total, em UMA passada
--   count(*) OVER() evita o segundo SELECT COUNT(*) classico.
--   Se a busca for so digito -> usa o btree UNIQUE do documento (prefixo).
--   Senao -> usa o GIN trigram sobre a coluna denormalizada 'busca'.
-- ---------------------------------------------------------------------------
-- Todos os parametros opcionais entram como TEXT e string vazia significa
-- "ausente". Isso mantem a fronteira JDBC livre de NULL - passar NULL em
-- native query do Hibernate exige tipo explicito e quebra facil.
-- O tipo de retorno mudou (CHAR -> VARCHAR), e CREATE OR REPLACE nao troca
-- assinatura: precisa dropar antes.
DROP FUNCTION IF EXISTS fn_cliente_grid(TEXT, TEXT, TEXT, INT, INT);

CREATE OR REPLACE FUNCTION fn_cliente_grid(
    p_q   TEXT DEFAULT '',
    p_uf  TEXT DEFAULT '',
    p_sit TEXT DEFAULT '',
    p_lim INT  DEFAULT 20,
    p_off INT  DEFAULT 0
)
RETURNS TABLE (
    id        BIGINT,
    nome      VARCHAR(150),
    documento VARCHAR(14),
    -- VARCHAR, nao CHAR: o Hibernate mapeia java.sql.Types.CHAR para
    -- Character em native query e a UF chegaria no front como "S" no lugar
    -- de "SP". Com VARCHAR vem String, que e o que o grid espera.
    uf        VARCHAR(2),
    tipo      VARCHAR(1),
    situacao  SMALLINT,
    total     BIGINT
) AS $fn$
DECLARE
    v_q     TEXT     := NULLIF(btrim(COALESCE(p_q, '')), '');
    v_uf    CHAR(2)  := NULLIF(upper(btrim(COALESCE(p_uf, ''))), '')::CHAR(2);
    v_sit   SMALLINT := NULLIF(btrim(COALESCE(p_sit, '')), '')::SMALLINT;
    v_digit TEXT;
BEGIN
    p_lim := LEAST(GREATEST(COALESCE(p_lim, 20), 1), 200);  -- teto anti-abuso
    p_off := GREATEST(COALESCE(p_off, 0), 0);
    v_digit := NULLIF(regexp_replace(COALESCE(v_q, ''), '[^0-9]', '', 'g'), '');

    IF v_q IS NOT NULL AND v_digit IS NOT NULL AND length(v_digit) = length(v_q) THEN
        -- caminho rapido: prefixo de documento no indice unico
        RETURN QUERY
            SELECT c.id, c.nome, c.documento,
                   c.uf::VARCHAR(2), c.tipo::VARCHAR(1), c.situacao,
                   count(*) OVER ()::BIGINT
              FROM cliente c
             WHERE c.documento LIKE v_digit || '%'
               AND (v_uf  IS NULL OR c.uf = v_uf)
               AND (v_sit IS NULL OR c.situacao = v_sit)
             ORDER BY c.id DESC
             LIMIT p_lim OFFSET p_off;
    ELSE
        RETURN QUERY
            SELECT c.id, c.nome, c.documento,
                   c.uf::VARCHAR(2), c.tipo::VARCHAR(1), c.situacao,
                   count(*) OVER ()::BIGINT
              FROM cliente c
             WHERE (v_q   IS NULL OR c.busca LIKE '%' || unaccent(lower(v_q)) || '%')
               AND (v_uf  IS NULL OR c.uf = v_uf)
               AND (v_sit IS NULL OR c.situacao = v_sit)
             ORDER BY c.id DESC
             LIMIT p_lim OFFSET p_off;
    END IF;
END;
$fn$ LANGUAGE plpgsql STABLE;

-- ---------------------------------------------------------------------------
-- fn_cliente_salvar : INSERT ou UPDATE com lock otimista.
--   p_id     NULL  -> insert
--   p_versao       -> versao lida pelo cliente; divergiu = 409 no REST
--   Retorna o id gravado. Lanca excecao com SQLSTATE proprio:
--     23514 documento invalido | 23505 duplicado | 40001 conflito de versao
-- ---------------------------------------------------------------------------
-- Convencao: TUDO chega como TEXT e '' significa NULL (ver fn_cliente_grid).
CREATE OR REPLACE FUNCTION fn_cliente_salvar(
    p_id          TEXT,
    p_versao      TEXT,
    p_tipo        TEXT,
    p_documento   TEXT,
    p_nome        TEXT,
    p_fantasia    TEXT,
    p_email       TEXT,
    p_telefone    TEXT,
    p_nascimento  TEXT,
    p_situacao    TEXT,
    p_cep         TEXT,
    p_logradouro  TEXT,
    p_numero      TEXT,
    p_complemento TEXT,
    p_bairro      TEXT,
    p_cidade      TEXT,
    p_uf          TEXT,
    p_limite      TEXT
)
RETURNS BIGINT AS $fn$
DECLARE
    v_doc    TEXT     := regexp_replace(COALESCE(p_documento, ''), '[^0-9]', '', 'g');
    v_id_in  BIGINT   := NULLIF(btrim(COALESCE(p_id, '')), '')::BIGINT;
    v_versao INT      := NULLIF(btrim(COALESCE(p_versao, '')), '')::INT;
    v_nasc   DATE     := NULLIF(btrim(COALESCE(p_nascimento, '')), '')::DATE;
    v_sit    SMALLINT := NULLIF(btrim(COALESCE(p_situacao, '')), '')::SMALLINT;
    v_lim    NUMERIC  := NULLIF(btrim(COALESCE(p_limite, '')), '')::NUMERIC;
    v_tipo   CHAR(1)  := NULLIF(btrim(COALESCE(p_tipo, '')), '')::CHAR(1);
    v_id     BIGINT;
    v_rows   INT;
BEGIN
    IF NOT fn_valida_documento(v_doc) THEN
        RAISE EXCEPTION 'documento invalido: %', v_doc USING ERRCODE = '23514';
    END IF;
    IF (v_tipo = 'F' AND length(v_doc) <> 11) OR (v_tipo = 'J' AND length(v_doc) <> 14) THEN
        RAISE EXCEPTION 'tipo % incompativel com o documento', v_tipo USING ERRCODE = '23514';
    END IF;

    IF v_id_in IS NULL THEN
        INSERT INTO cliente (tipo, documento, nome, fantasia, email, telefone, nascimento,
                             situacao, cep, logradouro, numero, complemento, bairro, cidade,
                             uf, limite_credito)
             VALUES (v_tipo, v_doc, p_nome,
                     NULLIF(p_fantasia, ''), NULLIF(p_email, ''), NULLIF(p_telefone, ''),
                     v_nasc, COALESCE(v_sit, 1::SMALLINT),
                     NULLIF(p_cep, ''), NULLIF(p_logradouro, ''), NULLIF(p_numero, ''),
                     NULLIF(p_complemento, ''), NULLIF(p_bairro, ''), NULLIF(p_cidade, ''),
                     NULLIF(p_uf, ''), COALESCE(v_lim, 0))
          RETURNING cliente.id INTO v_id;
        RETURN v_id;
    END IF;

    UPDATE cliente c
       SET tipo = v_tipo, documento = v_doc, nome = p_nome,
           fantasia = NULLIF(p_fantasia, ''), email = NULLIF(p_email, ''),
           telefone = NULLIF(p_telefone, ''), nascimento = v_nasc,
           situacao = COALESCE(v_sit, c.situacao), cep = NULLIF(p_cep, ''),
           logradouro = NULLIF(p_logradouro, ''), numero = NULLIF(p_numero, ''),
           complemento = NULLIF(p_complemento, ''), bairro = NULLIF(p_bairro, ''),
           cidade = NULLIF(p_cidade, ''), uf = NULLIF(p_uf, ''),
           limite_credito = COALESCE(v_lim, c.limite_credito)
     WHERE c.id = v_id_in
       AND (v_versao IS NULL OR c.versao = v_versao);

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 0 THEN
        IF EXISTS (SELECT 1 FROM cliente WHERE cliente.id = v_id_in) THEN
            RAISE EXCEPTION 'registro alterado por outro usuario' USING ERRCODE = '40001';
        END IF;
        RAISE EXCEPTION 'cliente % nao encontrado', v_id_in USING ERRCODE = 'P0002';
    END IF;

    RETURN v_id_in;
END;
$fn$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- fn_dashboard : TODOS os widgets do dash em 1 chamada e 1 JSON.
--   Antes: 5 endpoints REST. Agora: 1 round-trip, ~400 bytes gzipados.
--   Chaves curtas de proposito (payload minimo).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_dashboard(p_dias INT DEFAULT 30)
RETURNS JSON AS $fn$
DECLARE
    v_ini DATE := (now() - (COALESCE(p_dias, 30) || ' days')::INTERVAL)::DATE;
BEGIN
    RETURN (
        SELECT json_build_object(
            'k', (SELECT json_build_object(
                        't',  count(*),
                        'f',  count(*) FILTER (WHERE tipo = 'F'),
                        'j',  count(*) FILTER (WHERE tipo = 'J'),
                        'a',  count(*) FILTER (WHERE situacao = 1),
                        'b',  count(*) FILTER (WHERE situacao = 2),
                        'n',  count(*) FILTER (WHERE criado_em::DATE >= v_ini),
                        'lc', COALESCE(sum(limite_credito) FILTER (WHERE situacao = 1), 0))
                    FROM cliente),
            -- serie: [[dia, qtd], ...]  (array > objeto: -60% de bytes)
            's', COALESCE((SELECT json_agg(json_build_array(dia, qtd) ORDER BY dia)
                             FROM (SELECT criado_em::DATE AS dia, count(*) AS qtd
                                     FROM cliente
                                    WHERE criado_em::DATE >= v_ini
                                    GROUP BY 1) x), '[]'::JSON),
            -- top 8 UFs: [[uf, qtd], ...]
            'u', COALESCE((SELECT json_agg(json_build_array(uf, qtd))
                             FROM (SELECT uf, count(*) AS qtd
                                     FROM cliente
                                    WHERE uf IS NOT NULL
                                    GROUP BY uf ORDER BY 2 DESC LIMIT 8) y), '[]'::JSON),
            'd', p_dias
        )
    );
END;
$fn$ LANGUAGE plpgsql STABLE;

-- ---------------------------------------------------------------------------
-- fn_documento_lookup : autopreenchimento por CPF/CNPJ.
--   Cascata: 1) cliente ja cadastrado  2) base publica  3) NULL (app cai
--   para a API externa e regrava aqui + Redis).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_documento_lookup(p_doc TEXT)
RETURNS JSON AS $fn$
DECLARE
    d    TEXT := regexp_replace(COALESCE(p_doc, ''), '[^0-9]', '', 'g');
    v_js JSON;
BEGIN
    IF NOT fn_valida_documento(d) THEN
        RETURN json_build_object('ok', FALSE, 'msg', 'documento invalido');
    END IF;

    -- 1) ja e cliente? devolve o proprio cadastro (e sinaliza duplicidade)
    SELECT json_build_object(
             'ok', TRUE, 'src', 'db', 'dup', TRUE, 'id', c.id,
             'tipo', c.tipo, 'nome', c.nome, 'fantasia', c.fantasia,
             'email', c.email, 'tel', c.telefone, 'nasc', c.nascimento,
             'cep', c.cep, 'lgr', c.logradouro, 'num', c.numero,
             'bai', c.bairro, 'cid', c.cidade, 'uf', c.uf)
      INTO v_js
      FROM cliente c
     WHERE c.documento = d;
    IF v_js IS NOT NULL THEN RETURN v_js; END IF;

    -- 2) base publica
    IF length(d) = 11 THEN
        SELECT json_build_object('ok', TRUE, 'src', 'rf', 'dup', FALSE, 'tipo', 'F',
                                 'nome', p.nome, 'nasc', p.nascimento, 'sit', p.situacao)
          INTO v_js FROM pessoa_publica p WHERE p.cpf = d;
    ELSE
        SELECT json_build_object('ok', TRUE, 'src', 'rf', 'dup', FALSE, 'tipo', 'J',
                                 'nome', e.razao, 'fantasia', e.fantasia, 'nasc', e.abertura,
                                 'sit', e.situacao, 'cep', e.cep, 'lgr', e.logradouro,
                                 'num', e.numero, 'bai', e.bairro, 'cid', e.cidade,
                                 'uf', e.uf, 'tel', e.telefone, 'email', e.email)
          INTO v_js FROM empresa_publica e WHERE e.cnpj = d;
    END IF;

    RETURN COALESCE(v_js, json_build_object('ok', FALSE, 'msg', 'nao encontrado'));
END;
$fn$ LANGUAGE plpgsql STABLE;

-- ---------------------------------------------------------------------------
-- fn_empresa_publica_gravar : cache persistente do que veio da API externa
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_empresa_publica_gravar(
    p_cnpj TEXT, p_razao TEXT, p_fantasia TEXT, p_abertura TEXT, p_situacao TEXT,
    p_cep TEXT, p_lgr TEXT, p_num TEXT, p_bai TEXT, p_cid TEXT, p_uf TEXT,
    p_tel TEXT, p_email TEXT
) RETURNS VOID AS $fn$
BEGIN
    INSERT INTO empresa_publica AS e (cnpj, razao, fantasia, abertura, situacao, cep,
                                      logradouro, numero, bairro, cidade, uf, telefone, email)
         VALUES (regexp_replace(p_cnpj, '[^0-9]', '', 'g'), p_razao,
                 NULLIF(p_fantasia, ''),
                 NULLIF(btrim(COALESCE(p_abertura, '')), '')::DATE,
                 NULLIF(p_situacao, ''),
                 NULLIF(regexp_replace(COALESCE(p_cep,''), '[^0-9]', '', 'g'), ''),
                 NULLIF(p_lgr, ''), NULLIF(p_num, ''), NULLIF(p_bai, ''), NULLIF(p_cid, ''),
                 NULLIF(upper(p_uf), ''),
                 NULLIF(regexp_replace(COALESCE(p_tel,''), '[^0-9]', '', 'g'), ''),
                 NULLIF(lower(p_email), ''))
    ON CONFLICT (cnpj) DO UPDATE
       SET razao = EXCLUDED.razao, fantasia = EXCLUDED.fantasia,
           situacao = EXCLUDED.situacao, cidade = EXCLUDED.cidade, uf = EXCLUDED.uf;
END;
$fn$ LANGUAGE plpgsql;
