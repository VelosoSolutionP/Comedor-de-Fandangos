-- ============================================================================
--  comedores-de-fandangos :: cadastro de produtos
--  Mesmas regras do cadastro de cliente: integridade no banco, procedure para
--  trafegar dados, indice para cada plano de consulta.
-- ============================================================================
SET client_min_messages = WARNING;

-- ---------------------------------------------------------------------------
-- PRODUTO
-- ---------------------------------------------------------------------------
CREATE TABLE produto (
    id            BIGINT GENERATED ALWAYS AS IDENTITY,
    sku           VARCHAR(20)  NOT NULL,           -- codigo interno, sempre maiusculo
    nome          VARCHAR(150) NOT NULL,
    categoria     VARCHAR(40)  NOT NULL,
    unidade       VARCHAR(6)   NOT NULL DEFAULT 'UN',
    preco         NUMERIC(12,2) NOT NULL,          -- preco de venda
    custo         NUMERIC(12,2) NOT NULL DEFAULT 0,
    peso_g        INTEGER,                          -- peso liquido em gramas
    estoque       INTEGER      NOT NULL DEFAULT 0,
    estoque_min   INTEGER      NOT NULL DEFAULT 0,  -- abaixo disso = alerta
    situacao      SMALLINT     NOT NULL DEFAULT 1,  -- 0=INATIVO 1=ATIVO 2=DESCONTINUADO
    busca         TEXT,                             -- denormalizado p/ trigram
    criado_em     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMPTZ  NOT NULL DEFAULT now(),
    versao        INTEGER      NOT NULL DEFAULT 0,
    CONSTRAINT pk_produto          PRIMARY KEY (id),
    CONSTRAINT uk_produto_sku      UNIQUE (sku),
    CONSTRAINT ck_produto_sku      CHECK (sku ~ '^[A-Z0-9-]{3,20}$'),
    CONSTRAINT ck_produto_situacao CHECK (situacao IN (0,1,2)),
    CONSTRAINT ck_produto_preco    CHECK (preco >= 0),
    CONSTRAINT ck_produto_custo    CHECK (custo >= 0),
    CONSTRAINT ck_produto_estoque  CHECK (estoque >= 0 AND estoque_min >= 0),
    CONSTRAINT ck_produto_peso     CHECK (peso_g IS NULL OR peso_g > 0),
    CONSTRAINT ck_produto_unidade  CHECK (unidade IN ('UN','CX','FD','KG','G','L','ML','PCT'))
);

-- ============================================================================
-- INDICES
-- ============================================================================
-- busca livre por nome/SKU/categoria
CREATE INDEX ix_produto_busca_trgm ON produto USING gin (busca gin_trgm_ops);
-- listagem padrao (so ativos), ordenada por id desc
CREATE INDEX ix_produto_ativo_id   ON produto (id DESC) WHERE situacao = 1;
-- filtro por categoria
CREATE INDEX ix_produto_categoria  ON produto (categoria, id DESC);
-- alerta de reposicao: indice PARCIAL, so as linhas que interessam.
-- Numa base de 100k SKUs com 200 em falta, o indice guarda 200 linhas.
CREATE INDEX ix_produto_repor      ON produto (estoque) WHERE estoque <= estoque_min AND situacao = 1;

-- ============================================================================
-- TRIGGER: normalizacao e coluna de busca
-- ============================================================================
CREATE OR REPLACE FUNCTION trg_produto_normaliza() RETURNS trigger AS $fn$
BEGIN
    NEW.sku       := upper(btrim(NEW.sku));
    NEW.categoria := btrim(NEW.categoria);
    NEW.nome      := btrim(NEW.nome);
    NEW.busca     := unaccent(lower(NEW.nome || ' ' || NEW.sku || ' ' || NEW.categoria));
    IF TG_OP = 'UPDATE' THEN
        NEW.atualizado_em := now();
        NEW.versao        := OLD.versao + 1;
    END IF;
    RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

CREATE TRIGGER tg_produto_normaliza
    BEFORE INSERT OR UPDATE ON produto
    FOR EACH ROW EXECUTE FUNCTION trg_produto_normaliza();

-- ============================================================================
-- fn_produto_grid : mesma ideia do grid de cliente.
--   Busca que parece SKU (letras/numeros/hifen, sem espaco) entra pelo indice
--   unico; o resto vai pelo trigram.
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_produto_grid(
    p_q     TEXT DEFAULT '',
    p_cat   TEXT DEFAULT '',
    p_sit   TEXT DEFAULT '',
    p_repor TEXT DEFAULT '',     -- '1' = so os que precisam de reposicao
    p_lim   INT  DEFAULT 20,
    p_off   INT  DEFAULT 0
)
RETURNS TABLE (
    id        BIGINT,
    sku       VARCHAR(20),
    nome      VARCHAR(150),
    categoria VARCHAR(40),
    preco     NUMERIC(12,2),
    estoque   INTEGER,
    situacao  SMALLINT,
    repor     BOOLEAN,
    total     BIGINT
) AS $fn$
DECLARE
    v_q     TEXT     := NULLIF(btrim(COALESCE(p_q, '')), '');
    v_cat   TEXT     := NULLIF(btrim(COALESCE(p_cat, '')), '');
    v_sit   SMALLINT := NULLIF(btrim(COALESCE(p_sit, '')), '')::SMALLINT;
    v_repor BOOLEAN  := COALESCE(NULLIF(btrim(COALESCE(p_repor, '')), ''), '0') = '1';
    v_ehSku BOOLEAN;
BEGIN
    p_lim := LEAST(GREATEST(COALESCE(p_lim, 20), 1), 200);
    p_off := GREATEST(COALESCE(p_off, 0), 0);

    -- "parece SKU": sem espaco, so alfanumerico e hifen
    v_ehSku := v_q IS NOT NULL AND v_q ~ '^[A-Za-z0-9-]+$';

    RETURN QUERY
        SELECT p.id, p.sku, p.nome, p.categoria, p.preco, p.estoque, p.situacao,
               (p.estoque <= p.estoque_min AND p.situacao = 1) AS repor,
               count(*) OVER ()::BIGINT
          FROM produto p
         WHERE (v_q IS NULL
                OR (v_ehSku AND p.sku LIKE upper(v_q) || '%')
                OR p.busca LIKE '%' || unaccent(lower(v_q)) || '%')
           AND (v_cat   IS NULL OR p.categoria = v_cat)
           AND (v_sit   IS NULL OR p.situacao = v_sit)
           AND (NOT v_repor OR (p.estoque <= p.estoque_min AND p.situacao = 1))
         ORDER BY p.id DESC
         LIMIT p_lim OFFSET p_off;
END;
$fn$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- fn_produto_salvar : INSERT/UPDATE com lock otimista.
--   Convencao TEXT/'' = NULL, igual ao cadastro de cliente.
--   SQLSTATEs: 23505 duplicado | 23514 invalido | 40001 versao | P0002 sumiu
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_produto_salvar(
    p_id       TEXT,
    p_versao   TEXT,
    p_sku      TEXT,
    p_nome     TEXT,
    p_categoria TEXT,
    p_unidade  TEXT,
    p_preco    TEXT,
    p_custo    TEXT,
    p_peso     TEXT,
    p_estoque  TEXT,
    p_est_min  TEXT,
    p_situacao TEXT
)
RETURNS BIGINT AS $fn$
DECLARE
    v_id_in  BIGINT   := NULLIF(btrim(COALESCE(p_id, '')), '')::BIGINT;
    v_versao INT      := NULLIF(btrim(COALESCE(p_versao, '')), '')::INT;
    v_preco  NUMERIC  := NULLIF(btrim(COALESCE(p_preco, '')), '')::NUMERIC;
    v_custo  NUMERIC  := COALESCE(NULLIF(btrim(COALESCE(p_custo, '')), '')::NUMERIC, 0);
    v_peso   INT      := NULLIF(btrim(COALESCE(p_peso, '')), '')::INT;
    v_est    INT      := COALESCE(NULLIF(btrim(COALESCE(p_estoque, '')), '')::INT, 0);
    v_estmin INT      := COALESCE(NULLIF(btrim(COALESCE(p_est_min, '')), '')::INT, 0);
    v_sit    SMALLINT := NULLIF(btrim(COALESCE(p_situacao, '')), '')::SMALLINT;
    v_sku    TEXT     := upper(btrim(COALESCE(p_sku, '')));
    v_id     BIGINT;
    v_rows   INT;
BEGIN
    IF v_sku !~ '^[A-Z0-9-]{3,20}$' THEN
        RAISE EXCEPTION 'SKU invalido: %', v_sku USING ERRCODE = '23514';
    END IF;
    IF v_preco IS NULL OR v_preco < 0 THEN
        RAISE EXCEPTION 'preco obrigatorio e nao negativo' USING ERRCODE = '23514';
    END IF;
    IF length(btrim(COALESCE(p_nome, ''))) < 3 THEN
        RAISE EXCEPTION 'nome do produto muito curto' USING ERRCODE = '23514';
    END IF;

    IF v_id_in IS NULL THEN
        INSERT INTO produto (sku, nome, categoria, unidade, preco, custo, peso_g,
                             estoque, estoque_min, situacao)
             VALUES (v_sku, p_nome, COALESCE(NULLIF(btrim(p_categoria), ''), 'Geral'),
                     COALESCE(NULLIF(btrim(p_unidade), ''), 'UN'),
                     v_preco, v_custo, v_peso, v_est, v_estmin, COALESCE(v_sit, 1::SMALLINT))
          RETURNING produto.id INTO v_id;
        RETURN v_id;
    END IF;

    UPDATE produto p
       SET sku = v_sku, nome = p_nome,
           categoria = COALESCE(NULLIF(btrim(p_categoria), ''), p.categoria),
           unidade = COALESCE(NULLIF(btrim(p_unidade), ''), p.unidade),
           preco = v_preco, custo = v_custo, peso_g = v_peso,
           estoque = v_est, estoque_min = v_estmin,
           situacao = COALESCE(v_sit, p.situacao)
     WHERE p.id = v_id_in
       AND (v_versao IS NULL OR p.versao = v_versao);

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 0 THEN
        IF EXISTS (SELECT 1 FROM produto WHERE produto.id = v_id_in) THEN
            RAISE EXCEPTION 'registro alterado por outro usuario' USING ERRCODE = '40001';
        END IF;
        RAISE EXCEPTION 'produto % nao encontrado', v_id_in USING ERRCODE = 'P0002';
    END IF;

    RETURN v_id_in;
END;
$fn$ LANGUAGE plpgsql;

-- ============================================================================
-- fn_produto_categorias : lista para o combo, com contagem. 1 request.
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_produto_categorias()
RETURNS JSON AS $fn$
BEGIN
    RETURN COALESCE((
        SELECT json_agg(json_build_array(categoria, qtd) ORDER BY categoria)
          FROM (SELECT categoria, count(*) AS qtd FROM produto GROUP BY categoria) x
    ), '[]'::JSON);
END;
$fn$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- fn_dashboard_produto : KPIs do estoque, no mesmo formato curto do resto.
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_dashboard_produto()
RETURNS JSON AS $fn$
BEGIN
    RETURN (
        SELECT json_build_object(
            't',  count(*),
            'a',  count(*) FILTER (WHERE situacao = 1),
            'd',  count(*) FILTER (WHERE situacao = 2),
            'r',  count(*) FILTER (WHERE estoque <= estoque_min AND situacao = 1),
            'vl', COALESCE(sum(preco * estoque) FILTER (WHERE situacao = 1), 0),
            'c',  COALESCE((SELECT json_agg(json_build_array(categoria, qtd))
                              FROM (SELECT categoria, count(*) AS qtd
                                      FROM produto WHERE situacao = 1
                                     GROUP BY categoria ORDER BY 2 DESC LIMIT 8) y), '[]'::JSON))
          FROM produto
    );
END;
$fn$ LANGUAGE plpgsql STABLE;
