-- ============================================================================
--  smoke test das procedures - roda contra um banco ja inicializado.
--    psql -U fandangos -d fandangos -v ON_ERROR_STOP=1 -f db/test/smoke.sql
--  Qualquer divergencia aborta com ERROR (ON_ERROR_STOP=1 devolve exit != 0).
-- ============================================================================
\set ON_ERROR_STOP on
\timing off
SET client_min_messages = NOTICE;

DO $t$
DECLARE
    n     BIGINT;
    js    JSON;
    v_id  BIGINT;
    v_ver INT;
    ok    BOOLEAN;
    linha RECORD;
BEGIN
    ----------------------------------------------------------------- carga
    SELECT count(*) INTO n FROM cliente;
    IF n < 1900 THEN RAISE EXCEPTION 'seed carregou pouco: % clientes', n; END IF;
    RAISE NOTICE '01 carga.................. % clientes', n;

    SELECT count(*) INTO n FROM cliente WHERE NOT fn_valida_documento(documento);
    IF n <> 0 THEN RAISE EXCEPTION '% documentos com DV invalido', n; END IF;
    RAISE NOTICE '02 todos os DV validos.... ok';

    -------------------------------------------------------- valida documento
    IF NOT fn_valida_documento('529.982.247-25')   THEN RAISE EXCEPTION 'CPF valido recusado'; END IF;
    IF     fn_valida_documento('529.982.247-26')   THEN RAISE EXCEPTION 'CPF invalido aceito'; END IF;
    IF NOT fn_valida_documento('11.222.333/0001-81') THEN RAISE EXCEPTION 'CNPJ valido recusado'; END IF;
    IF     fn_valida_documento('11222333000180')   THEN RAISE EXCEPTION 'CNPJ invalido aceito'; END IF;
    IF     fn_valida_documento('11111111111')      THEN RAISE EXCEPTION 'CPF repetido aceito'; END IF;
    RAISE NOTICE '03 fn_valida_documento.... ok';

    ------------------------------------------------------------------- grid
    SELECT count(*) INTO n FROM fn_cliente_grid('', '', '', 20, 0);
    IF n <> 20 THEN RAISE EXCEPTION 'grid devolveu % linhas, esperava 20', n; END IF;

    SELECT total INTO n FROM fn_cliente_grid('', '', '', 20, 0) LIMIT 1;
    IF n < 1900 THEN RAISE EXCEPTION 'total do grid veio errado: %', n; END IF;
    RAISE NOTICE '04 grid pagina+total...... 20 linhas, total %', n;

    -- filtro por UF
    SELECT count(*) INTO n FROM fn_cliente_grid('', 'SP', '', 200, 0) WHERE uf <> 'SP';
    IF n <> 0 THEN RAISE EXCEPTION 'filtro de UF vazou % linhas', n; END IF;

    -- filtro por situacao
    SELECT count(*) INTO n FROM fn_cliente_grid('', '', '2', 200, 0) WHERE situacao <> 2;
    IF n <> 0 THEN RAISE EXCEPTION 'filtro de situacao vazou % linhas', n; END IF;
    RAISE NOTICE '05 filtros uf/situacao.... ok';

    -- caminho rapido: busca so com digitos usa prefixo de documento
    SELECT documento INTO linha FROM cliente LIMIT 1;
    SELECT count(*) INTO n FROM fn_cliente_grid(
        (SELECT documento FROM cliente ORDER BY id LIMIT 1), '', '', 20, 0);
    IF n <> 1 THEN RAISE EXCEPTION 'busca por documento devolveu % linhas', n; END IF;
    RAISE NOTICE '06 busca por documento.... ok';

    -- teto anti-abuso: pedir 10.000 devolve no maximo 200
    SELECT count(*) INTO n FROM fn_cliente_grid('', '', '', 10000, 0);
    IF n > 200 THEN RAISE EXCEPTION 'teto de pagina furado: % linhas', n; END IF;
    RAISE NOTICE '07 teto de pagina......... % linhas (max 200)', n;

    -------------------------------------------------------------- dashboard
    js := fn_dashboard(30);
    IF (js->'k'->>'t')::BIGINT < 1900 THEN RAISE EXCEPTION 'dashboard sem total'; END IF;
    IF (js->'k'->>'f')::BIGINT + (js->'k'->>'j')::BIGINT <> (js->'k'->>'t')::BIGINT THEN
        RAISE EXCEPTION 'PF + PJ nao fecha com o total';
    END IF;
    IF json_array_length(js->'u') = 0 THEN RAISE EXCEPTION 'dashboard sem UFs'; END IF;
    RAISE NOTICE '08 fn_dashboard........... t=% f=% j=% ativos=% series=% ufs=%',
        js->'k'->>'t', js->'k'->>'f', js->'k'->>'j', js->'k'->>'a',
        json_array_length(js->'s'), json_array_length(js->'u');

    ----------------------------------------------------------------- lookup
    -- documento de cliente existente -> dup = true
    js := fn_documento_lookup((SELECT documento FROM cliente ORDER BY id LIMIT 1));
    IF NOT (js->>'ok')::BOOLEAN OR NOT (js->>'dup')::BOOLEAN THEN
        RAISE EXCEPTION 'lookup nao sinalizou duplicidade: %', js;
    END IF;
    RAISE NOTICE '09 lookup cliente existente ok (dup=true, src=%)', js->>'src';

    -- CPF que so existe na base publica -> ok, dup = false
    js := fn_documento_lookup((SELECT p.cpf FROM pessoa_publica p
                                LEFT JOIN cliente c ON c.documento = p.cpf
                               WHERE c.id IS NULL LIMIT 1));
    IF NOT (js->>'ok')::BOOLEAN OR (js->>'dup')::BOOLEAN THEN
        RAISE EXCEPTION 'lookup na base publica falhou: %', js;
    END IF;
    RAISE NOTICE '10 lookup base publica.... ok (dup=false, src=%)', js->>'src';

    -- documento invalido
    js := fn_documento_lookup('11111111111');
    IF (js->>'ok')::BOOLEAN THEN RAISE EXCEPTION 'lookup aceitou documento invalido'; END IF;
    RAISE NOTICE '11 lookup doc invalido.... ok';

    ----------------------------------------------------------------- salvar
    -- INSERT
    v_id := fn_cliente_salvar('', '', 'F', '529.982.247-25', 'Cliente De Teste',
                              '', 'teste@fandangos.dev', '11987654321', '1990-08-27',
                              '1', '01310100', 'Av Paulista', '1000', '', 'Bela Vista',
                              'Sao Paulo', 'SP', '1500.50');
    IF v_id IS NULL THEN RAISE EXCEPTION 'insert nao devolveu id'; END IF;
    RAISE NOTICE '12 insert................. id=%', v_id;

    -- trigger normalizou e montou a coluna de busca
    SELECT documento = '52998224725' AND busca LIKE '%cliente de teste%' AND versao = 0
      INTO ok FROM cliente WHERE id = v_id;
    IF NOT ok THEN RAISE EXCEPTION 'trigger de normalizacao nao rodou'; END IF;
    RAISE NOTICE '13 trigger normaliza...... ok';

    -- auditoria registrou o INSERT
    SELECT count(*) INTO n FROM cliente_evento WHERE cliente_id = v_id AND acao = 'I';
    IF n <> 1 THEN RAISE EXCEPTION 'auditoria nao registrou o insert (% eventos)', n; END IF;
    RAISE NOTICE '14 trigger auditoria...... ok';

    -- UPDATE com versao correta
    SELECT versao INTO v_ver FROM cliente WHERE id = v_id;
    PERFORM fn_cliente_salvar(v_id::TEXT, v_ver::TEXT, 'F', '52998224725',
                              'Cliente De Teste Alterado', '', '', '', '',
                              '1', '', '', '', '', '', '', 'RJ', '');
    SELECT nome = 'Cliente De Teste Alterado' AND uf = 'RJ' AND versao = v_ver + 1
      INTO ok FROM cliente WHERE id = v_id;
    IF NOT ok THEN RAISE EXCEPTION 'update nao aplicou'; END IF;
    RAISE NOTICE '15 update + versao........ versao % -> %', v_ver, v_ver + 1;

    -- UPDATE com versao velha -> 40001
    BEGIN
        PERFORM fn_cliente_salvar(v_id::TEXT, v_ver::TEXT, 'F', '52998224725',
                                  'Nao Deve Gravar', '', '', '', '', '1',
                                  '', '', '', '', '', '', '', '');
        RAISE EXCEPTION 'lock otimista NAO barrou a versao velha';
    EXCEPTION WHEN SQLSTATE '40001' THEN
        RAISE NOTICE '16 lock otimista.......... ok (SQLSTATE 40001)';
    END;

    -- documento com DV invalido -> 23514
    BEGIN
        PERFORM fn_cliente_salvar('', '', 'F', '52998224724', 'Doc Ruim',
                                  '', '', '', '', '1', '', '', '', '', '', '', '', '');
        RAISE EXCEPTION 'DV invalido NAO foi barrado';
    EXCEPTION WHEN SQLSTATE '23514' THEN
        RAISE NOTICE '17 DV invalido barrado.... ok (SQLSTATE 23514)';
    END;

    -- tipo divergente do documento -> 23514
    BEGIN
        PERFORM fn_cliente_salvar('', '', 'J', '52998224725', 'Tipo Errado',
                                  '', '', '', '', '1', '', '', '', '', '', '', '', '');
        RAISE EXCEPTION 'tipo divergente NAO foi barrado';
    EXCEPTION WHEN SQLSTATE '23514' THEN
        RAISE NOTICE '18 tipo divergente........ ok (SQLSTATE 23514)';
    END;

    -- documento duplicado -> 23505
    BEGIN
        PERFORM fn_cliente_salvar('', '', 'F', '52998224725', 'Duplicado',
                                  '', '', '', '', '1', '', '', '', '', '', '', '', '');
        RAISE EXCEPTION 'duplicidade NAO foi barrada';
    EXCEPTION WHEN unique_violation THEN
        RAISE NOTICE '19 duplicidade barrada.... ok (SQLSTATE 23505)';
    END;

    -- id inexistente -> P0002
    BEGIN
        PERFORM fn_cliente_salvar('99999999', '', 'F', '52998224725', 'Fantasma',
                                  '', '', '', '', '1', '', '', '', '', '', '', '', '');
        RAISE EXCEPTION 'id inexistente NAO foi barrado';
    EXCEPTION WHEN SQLSTATE 'P0002' THEN
        RAISE NOTICE '20 id inexistente......... ok (SQLSTATE P0002)';
    END;

    -- limpeza
    DELETE FROM cliente WHERE id = v_id;
    SELECT count(*) INTO n FROM cliente_evento WHERE cliente_id = v_id;
    IF n <> 0 THEN RAISE EXCEPTION 'ON DELETE CASCADE nao limpou a auditoria'; END IF;
    RAISE NOTICE '21 delete cascade......... ok';

    ------------------------------------------------------------------ senha
    SELECT senha_hash = crypt('fandangos@123', senha_hash) INTO ok
      FROM usuario WHERE login = 'admin';
    IF NOT ok THEN RAISE EXCEPTION 'hash BCrypt do admin nao confere'; END IF;

    SELECT senha_hash LIKE '$2a$%' AND length(senha_hash) = 60 INTO ok
      FROM usuario WHERE login = 'admin';
    IF NOT ok THEN RAISE EXCEPTION 'hash nao esta no formato $2a$ de 60 chars'; END IF;
    RAISE NOTICE '22 BCrypt do seed......... ok (formato $2a$, 60 chars)';

    RAISE NOTICE '';
    RAISE NOTICE '>>> SMOKE TEST: 22/22 OK';
END;
$t$;
