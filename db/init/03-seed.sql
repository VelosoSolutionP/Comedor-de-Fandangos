-- ============================================================================
--  comedores-de-fandangos :: carga inicial
--  Gera massa REAL (documentos com DV valido) para medir performance de verdade.
-- ============================================================================
SET client_min_messages = WARNING;

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- crypt()/gen_salt('bf') = BCrypt $2a$

-- ---------------------------------------------------------------------------
-- helpers de geracao (removidos no fim do script)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION seed_cpf(p_base TEXT) RETURNS TEXT AS $fn$
DECLARE d TEXT; soma INT; dv INT; i INT;
BEGIN
    d := lpad(p_base, 9, '0');
    soma := 0;
    FOR i IN 1..9 LOOP soma := soma + substr(d,i,1)::INT * (11 - i); END LOOP;
    dv := 11 - (soma % 11); IF dv >= 10 THEN dv := 0; END IF;
    d := d || dv::TEXT;
    soma := 0;
    FOR i IN 1..10 LOOP soma := soma + substr(d,i,1)::INT * (12 - i); END LOOP;
    dv := 11 - (soma % 11); IF dv >= 10 THEN dv := 0; END IF;
    RETURN d || dv::TEXT;
END;
$fn$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION seed_cnpj(p_base TEXT) RETURNS TEXT AS $fn$
DECLARE d TEXT; soma INT; peso INT; dv INT; i INT;
BEGIN
    d := lpad(p_base, 8, '0') || '0001';
    soma := 0; peso := 5;
    FOR i IN 1..12 LOOP
        soma := soma + substr(d,i,1)::INT * peso;
        peso := CASE WHEN peso = 2 THEN 9 ELSE peso - 1 END;
    END LOOP;
    dv := soma % 11; dv := CASE WHEN dv < 2 THEN 0 ELSE 11 - dv END;
    d := d || dv::TEXT;
    soma := 0; peso := 6;
    FOR i IN 1..13 LOOP
        soma := soma + substr(d,i,1)::INT * peso;
        peso := CASE WHEN peso = 2 THEN 9 ELSE peso - 1 END;
    END LOOP;
    dv := soma % 11; dv := CASE WHEN dv < 2 THEN 0 ELSE 11 - dv END;
    RETURN d || dv::TEXT;
END;
$fn$ LANGUAGE plpgsql IMMUTABLE;

-- ---------------------------------------------------------------------------
-- USUARIOS  (senha via pgcrypto bf = hash $2a$ lido pelo jBCrypt no Java)
--   admin    / fandangos@123   (perfil 9)
--   operador / operador@123    (perfil 1)
-- ---------------------------------------------------------------------------
INSERT INTO usuario (login, senha_hash, nome, perfil) VALUES
 ('admin',    crypt('fandangos@123', gen_salt('bf', 10)), 'Administrador Geral', 9),
 ('operador', crypt('operador@123',  gen_salt('bf', 10)), 'Operador de Cadastro', 1);

-- ---------------------------------------------------------------------------
-- MASSA DE CLIENTES + BASES PUBLICAS
-- ---------------------------------------------------------------------------
DO $seed$
DECLARE
    nomes      TEXT[] := ARRAY['Ana','Bruno','Carla','Diego','Elaine','Fabio','Gisele','Heitor',
                               'Isabela','Joao','Karina','Lucas','Marina','Nelson','Olivia',
                               'Paulo','Queila','Rafael','Sabrina','Tiago','Ursula','Vinicius'];
    sobrenomes TEXT[] := ARRAY['Silva','Souza','Oliveira','Pereira','Costa','Almeida','Barbosa',
                               'Ribeiro','Fernandes','Carvalho','Gomes','Martins','Rocha','Dias'];
    ramos      TEXT[] := ARRAY['Distribuidora','Comercio','Industria','Logistica','Alimentos',
                               'Snacks','Atacado','Importadora'];
    marcas     TEXT[] := ARRAY['Fandangos','Crocante','Milho Doce','Salgadinho','Puff','Sabor',
                               'Do Sul','Guanabara'];
    ufs        TEXT[] := ARRAY['SP','RJ','MG','RS','PR','SC','BA','PE','CE','GO','DF','ES'];
    cidades    TEXT[] := ARRAY['Sao Paulo','Rio de Janeiro','Belo Horizonte','Porto Alegre',
                               'Curitiba','Florianopolis','Salvador','Recife','Fortaleza',
                               'Goiania','Brasilia','Vitoria'];
    i     INT;
    ix    INT;
    doc   TEXT;
    nm    TEXT;
    dt    TIMESTAMPTZ;
BEGIN
    -- ---- 1400 pessoas fisicas
    FOR i IN 1..1400 LOOP
        doc := seed_cpf((100000000 + i * 7919)::TEXT);
        nm  := nomes[1 + (i * 3) % array_length(nomes,1)] || ' ' ||
               sobrenomes[1 + (i * 5) % array_length(sobrenomes,1)] || ' ' ||
               sobrenomes[1 + (i * 11) % array_length(sobrenomes,1)];
        ix  := 1 + (i % array_length(ufs,1));
        dt  := now() - ((i % 60) || ' days')::INTERVAL - ((i % 24) || ' hours')::INTERVAL;

        INSERT INTO cliente (tipo, documento, nome, email, telefone, nascimento, situacao,
                             cep, logradouro, numero, bairro, cidade, uf, limite_credito, criado_em)
        VALUES ('F', doc, nm,
                lower(replace(nm, ' ', '.')) || i || '@fandangos.dev',
                (11 + (i % 78))::TEXT || lpad((900000000 + i)::TEXT, 9, '0'),
                DATE '1960-01-01' + (i * 13 % 16000),
                CASE WHEN i % 37 = 0 THEN 0 WHEN i % 53 = 0 THEN 2 ELSE 1 END,
                lpad((1000000 + i * 97)::TEXT, 8, '0'),
                'Rua das Fandangas', (i % 900 + 1)::TEXT, 'Centro',
                cidades[ix], ufs[ix], (i % 20) * 500, dt);

        -- metade tambem existe na "Receita" (autopreenchimento de quem ja e cliente)
        IF i % 2 = 0 THEN
            INSERT INTO pessoa_publica (cpf, nome, nascimento, situacao)
                 VALUES (doc, nm, DATE '1960-01-01' + (i * 13 % 16000), 'REGULAR')
            ON CONFLICT DO NOTHING;
        END IF;
    END LOOP;

    -- ---- 600 pessoas juridicas
    FOR i IN 1..600 LOOP
        doc := seed_cnpj((10000000 + i * 3571)::TEXT);
        nm  := marcas[1 + (i * 3) % array_length(marcas,1)] || ' ' ||
               ramos[1 + (i * 7) % array_length(ramos,1)] || ' LTDA';
        ix  := 1 + (i % array_length(ufs,1));
        dt  := now() - ((i % 60) || ' days')::INTERVAL;

        INSERT INTO cliente (tipo, documento, nome, fantasia, email, telefone, nascimento,
                             situacao, cep, logradouro, numero, bairro, cidade, uf,
                             limite_credito, criado_em)
        VALUES ('J', doc, nm, marcas[1 + (i * 3) % array_length(marcas,1)],
                'contato' || i || '@' || lower(replace(marcas[1 + (i*3) % array_length(marcas,1)], ' ', '')) || '.com.br',
                (11 + (i % 78))::TEXT || lpad((30000000 + i)::TEXT, 9, '0'),
                DATE '1995-01-01' + (i * 17 % 9000),
                CASE WHEN i % 41 = 0 THEN 0 ELSE 1 END,
                lpad((2000000 + i * 89)::TEXT, 8, '0'),
                'Avenida Industrial', (i % 3000 + 1)::TEXT, 'Distrito Industrial',
                cidades[ix], ufs[ix], (i % 40) * 2500, dt);
    END LOOP;

    -- ---- 400 CNPJs que NAO sao clientes ainda -> alimentam o autopreenchimento
    FOR i IN 601..1000 LOOP
        doc := seed_cnpj((10000000 + i * 3571)::TEXT);
        ix  := 1 + (i % array_length(ufs,1));
        INSERT INTO empresa_publica (cnpj, razao, fantasia, abertura, situacao, cep,
                                     logradouro, numero, bairro, cidade, uf, telefone, email)
             VALUES (doc,
                     marcas[1 + (i*3) % array_length(marcas,1)] || ' ' ||
                     ramos[1 + (i*7) % array_length(ramos,1)] || ' LTDA',
                     marcas[1 + (i*3) % array_length(marcas,1)],
                     DATE '1998-01-01' + (i * 19 % 9000), 'ATIVA',
                     lpad((3000000 + i * 71)::TEXT, 8, '0'),
                     'Rodovia dos Salgadinhos', (i % 500 + 1)::TEXT, 'Parque Industrial',
                     cidades[ix], ufs[ix],
                     (11 + (i % 78))::TEXT || lpad((40000000 + i)::TEXT, 9, '0'),
                     'comercial' || i || '@fandangos.com.br')
        ON CONFLICT DO NOTHING;
    END LOOP;

    -- ---- 400 CPFs "da Receita" ainda nao cadastrados
    FOR i IN 1401..1800 LOOP
        doc := seed_cpf((100000000 + i * 7919)::TEXT);
        INSERT INTO pessoa_publica (cpf, nome, nascimento, situacao)
             VALUES (doc,
                     nomes[1 + (i*3) % array_length(nomes,1)] || ' ' ||
                     sobrenomes[1 + (i*5) % array_length(sobrenomes,1)],
                     DATE '1960-01-01' + (i * 13 % 16000), 'REGULAR')
        ON CONFLICT DO NOTHING;
    END LOOP;
END;
$seed$;

DROP FUNCTION seed_cpf(TEXT);
DROP FUNCTION seed_cnpj(TEXT);

-- ---------------------------------------------------------------------------
-- Estatisticas frescas -> planner escolhe os indices certos desde o 1o request
-- ---------------------------------------------------------------------------
ANALYZE cliente;
ANALYZE cliente_evento;
ANALYZE pessoa_publica;
ANALYZE empresa_publica;

-- ---------------------------------------------------------------------------
-- Sanidade: aborta o boot se algum documento gerado tiver DV invalido
-- ---------------------------------------------------------------------------
DO $chk$
DECLARE n INT;
BEGIN
    SELECT count(*) INTO n FROM cliente WHERE NOT fn_valida_documento(documento);
    IF n > 0 THEN RAISE EXCEPTION 'seed gerou % documentos invalidos', n; END IF;
    SELECT count(*) INTO n FROM pessoa_publica WHERE NOT fn_valida_documento(cpf);
    IF n > 0 THEN RAISE EXCEPTION 'seed gerou % CPFs publicos invalidos', n; END IF;
    SELECT count(*) INTO n FROM empresa_publica WHERE NOT fn_valida_documento(cnpj);
    IF n > 0 THEN RAISE EXCEPTION 'seed gerou % CNPJs publicos invalidos', n; END IF;
    RAISE NOTICE 'seed ok: % clientes', (SELECT count(*) FROM cliente);
END;
$chk$;
