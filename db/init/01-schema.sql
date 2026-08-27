-- ============================================================================
--  comedores-de-fandangos :: schema
--  PostgreSQL 14 | modelagem enxuta, indexada e pensada para leitura pesada
-- ============================================================================
SET client_min_messages = WARNING;

CREATE EXTENSION IF NOT EXISTS pg_trgm;   -- busca por similaridade (LIKE %x%)
CREATE EXTENSION IF NOT EXISTS unaccent;  -- normalizacao de acentos
CREATE EXTENSION IF NOT EXISTS btree_gin;

-- ---------------------------------------------------------------------------
-- USUARIO (autenticacao JWT + BCrypt)
-- ---------------------------------------------------------------------------
CREATE TABLE usuario (
    id            BIGINT GENERATED ALWAYS AS IDENTITY,
    login         VARCHAR(60)  NOT NULL,
    senha_hash    CHAR(60)     NOT NULL,           -- BCrypt $2a$ = 60 chars fixos
    nome          VARCHAR(120) NOT NULL,
    perfil        SMALLINT     NOT NULL DEFAULT 1, -- 1=OPERADOR 9=ADMIN
    ativo         BOOLEAN      NOT NULL DEFAULT TRUE,
    falhas_login  SMALLINT     NOT NULL DEFAULT 0,
    ultimo_acesso TIMESTAMPTZ,
    criado_em     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT pk_usuario        PRIMARY KEY (id),
    CONSTRAINT uk_usuario_login  UNIQUE (login),
    CONSTRAINT ck_usuario_perfil CHECK (perfil IN (1,9))
);

-- ---------------------------------------------------------------------------
-- CLIENTE  (PF/PJ na mesma tabela: 1 round-trip, 0 join)
--   documento = SOMENTE DIGITOS. Mascara e responsabilidade da UI.
-- ---------------------------------------------------------------------------
CREATE TABLE cliente (
    id             BIGINT GENERATED ALWAYS AS IDENTITY,
    tipo           CHAR(1)      NOT NULL,           -- F=fisica  J=juridica
    documento      VARCHAR(14)  NOT NULL,           -- 11=CPF 14=CNPJ
    nome           VARCHAR(150) NOT NULL,           -- nome | razao social
    fantasia       VARCHAR(150),
    email          VARCHAR(120),
    telefone       VARCHAR(11),                     -- DDD+numero, so digitos
    nascimento     DATE,                            -- nascimento | abertura
    situacao       SMALLINT     NOT NULL DEFAULT 1, -- 0=INATIVO 1=ATIVO 2=BLOQUEADO
    cep            CHAR(8),
    logradouro     VARCHAR(150),
    numero         VARCHAR(10),
    complemento    VARCHAR(60),
    bairro         VARCHAR(80),
    cidade         VARCHAR(80),
    uf             CHAR(2),
    limite_credito NUMERIC(12,2) NOT NULL DEFAULT 0,
    busca          TEXT,                            -- denormalizado p/ trigram
    criado_em      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    atualizado_em  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    versao         INTEGER      NOT NULL DEFAULT 0, -- lock otimista (JPA @Version)
    CONSTRAINT pk_cliente           PRIMARY KEY (id),
    CONSTRAINT uk_cliente_documento UNIQUE (documento),
    CONSTRAINT ck_cliente_tipo      CHECK (tipo IN ('F','J')),
    CONSTRAINT ck_cliente_doc       CHECK (documento ~ '^[0-9]+$'
                                      AND ((tipo='F' AND length(documento)=11)
                                        OR (tipo='J' AND length(documento)=14))),
    CONSTRAINT ck_cliente_situacao  CHECK (situacao IN (0,1,2)),
    CONSTRAINT ck_cliente_uf        CHECK (uf IS NULL OR uf ~ '^[A-Z]{2}$'),
    CONSTRAINT ck_cliente_cep       CHECK (cep IS NULL OR cep ~ '^[0-9]{8}$'),
    CONSTRAINT ck_cliente_limite    CHECK (limite_credito >= 0)
);

-- ---------------------------------------------------------------------------
-- CLIENTE_EVENTO (trilha de auditoria + serie temporal do dashboard)
-- ---------------------------------------------------------------------------
CREATE TABLE cliente_evento (
    id         BIGINT GENERATED ALWAYS AS IDENTITY,
    cliente_id BIGINT      NOT NULL,
    usuario_id BIGINT,
    acao       CHAR(1)     NOT NULL,   -- I=insert U=update D=delete
    em         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT pk_cliente_evento PRIMARY KEY (id),
    CONSTRAINT fk_evt_cliente FOREIGN KEY (cliente_id) REFERENCES cliente (id) ON DELETE CASCADE,
    CONSTRAINT fk_evt_usuario FOREIGN KEY (usuario_id) REFERENCES usuario (id) ON DELETE SET NULL,
    CONSTRAINT ck_evt_acao    CHECK (acao IN ('I','U','D'))
);

-- ---------------------------------------------------------------------------
-- BASES PUBLICAS (simulam integracao Serpro/Receita p/ autopreenchimento)
-- ---------------------------------------------------------------------------
CREATE TABLE pessoa_publica (
    cpf        CHAR(11)     NOT NULL,
    nome       VARCHAR(150) NOT NULL,
    nascimento DATE,
    situacao   VARCHAR(20),
    CONSTRAINT pk_pessoa_publica PRIMARY KEY (cpf)
);

CREATE TABLE empresa_publica (
    cnpj       CHAR(14)     NOT NULL,
    razao      VARCHAR(150) NOT NULL,
    fantasia   VARCHAR(150),
    abertura   DATE,
    situacao   VARCHAR(20),
    cep        CHAR(8),
    logradouro VARCHAR(150),
    numero     VARCHAR(10),
    bairro     VARCHAR(80),
    cidade     VARCHAR(80),
    uf         CHAR(2),
    telefone   VARCHAR(11),
    email      VARCHAR(120),
    CONSTRAINT pk_empresa_publica PRIMARY KEY (cnpj)
);

-- ============================================================================
-- INDICES  (cada um existe para um plano de consulta especifico)
-- ============================================================================
-- grid: filtro por texto livre (nome/fantasia/documento) -> trigram GIN
CREATE INDEX ix_cliente_busca_trgm  ON cliente USING gin (busca gin_trgm_ops);
-- grid: listagem default ordenada por id desc, so ativos (indice parcial = menor)
CREATE INDEX ix_cliente_ativo_id    ON cliente (id DESC) WHERE situacao = 1;
-- grid: filtro combinado UF + ordenacao
CREATE INDEX ix_cliente_uf_id       ON cliente (uf, id DESC);
-- dashboard: KPIs por tipo/situacao sem tocar na heap (index-only scan)
CREATE INDEX ix_cliente_tipo_sit    ON cliente (tipo, situacao);
-- dashboard: serie temporal. BRIN = fracao do tamanho de um btree em append-only
CREATE INDEX ix_cliente_criado_brin ON cliente USING brin (criado_em) WITH (pages_per_range = 32);
-- busca por email (case-insensitive)
CREATE INDEX ix_cliente_email_lower ON cliente (lower(email)) WHERE email IS NOT NULL;
-- auditoria
CREATE INDEX ix_evt_cliente         ON cliente_evento (cliente_id, em DESC);
CREATE INDEX ix_evt_em_brin         ON cliente_evento USING brin (em);

-- ============================================================================
-- TRIGGERS: integridade garantida na fonte, nao na aplicacao
-- ============================================================================
CREATE OR REPLACE FUNCTION trg_cliente_normaliza() RETURNS trigger AS $fn$
BEGIN
    NEW.documento := regexp_replace(COALESCE(NEW.documento,''), '[^0-9]', '', 'g');
    NEW.telefone  := NULLIF(regexp_replace(COALESCE(NEW.telefone,''), '[^0-9]', '', 'g'), '');
    NEW.cep       := NULLIF(regexp_replace(COALESCE(NEW.cep,''),      '[^0-9]', '', 'g'), '');
    NEW.uf        := upper(NEW.uf);
    NEW.email     := lower(NULLIF(btrim(NEW.email), ''));
    NEW.busca     := unaccent(lower(NEW.nome || ' ' || COALESCE(NEW.fantasia,'') || ' ' || NEW.documento));
    IF TG_OP = 'UPDATE' THEN
        NEW.atualizado_em := now();
        NEW.versao        := OLD.versao + 1;
    END IF;
    RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

CREATE TRIGGER tg_cliente_normaliza
    BEFORE INSERT OR UPDATE ON cliente
    FOR EACH ROW EXECUTE FUNCTION trg_cliente_normaliza();

CREATE OR REPLACE FUNCTION trg_cliente_auditoria() RETURNS trigger AS $fn$
BEGIN
    INSERT INTO cliente_evento (cliente_id, acao)
         VALUES (NEW.id, CASE WHEN TG_OP = 'INSERT' THEN 'I' ELSE 'U' END);
    RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

CREATE TRIGGER tg_cliente_auditoria
    AFTER INSERT OR UPDATE ON cliente
    FOR EACH ROW EXECUTE FUNCTION trg_cliente_auditoria();
