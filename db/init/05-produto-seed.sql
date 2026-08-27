-- ============================================================================
--  Catalogo inicial de produtos. Tema da casa: salgadinho de milho.
-- ============================================================================
SET client_min_messages = WARNING;

DO $seed$
DECLARE
    marcas     TEXT[] := ARRAY['Fandangos','Crocante','Puff','Milho Doce','Guanabara','Do Sul'];
    sabores    TEXT[] := ARRAY['Presunto','Queijo','Churrasco','Bacon','Cebola','Pizza',
                               'Requeijao','Calabresa','Original','Pimenta'];
    categorias TEXT[] := ARRAY['Salgadinho','Biscoito','Amendoim','Bebida','Doce','Cereal'];
    unidades   TEXT[] := ARRAY['UN','PCT','CX','FD'];
    gramaturas INT[]  := ARRAY[45, 60, 90, 120, 160, 200, 300];
    i    INT;
    im   INT;
    isb  INT;
    ic   INT;
    peso INT;
    v_preco NUMERIC;
    v_est   INT;
    v_min   INT;
BEGIN
    FOR i IN 1..120 LOOP
        im   := 1 + (i * 3) % array_length(marcas, 1);
        isb  := 1 + (i * 7) % array_length(sabores, 1);
        ic   := 1 + (i * 5) % array_length(categorias, 1);
        peso := gramaturas[1 + (i * 11) % array_length(gramaturas, 1)];

        v_preco := round((2.5 + (i % 37) * 0.85)::NUMERIC, 2);
        v_min   := 10 + (i % 5) * 10;
        -- 1 em cada 7 nasce abaixo do minimo, para o alerta de reposicao
        -- ter o que mostrar desde o primeiro acesso
        v_est   := CASE WHEN i % 7 = 0 THEN (i % 8) ELSE 40 + (i * 13) % 400 END;

        INSERT INTO produto (sku, nome, categoria, unidade, preco, custo, peso_g,
                             estoque, estoque_min, situacao)
             VALUES (
                'FDG-' || lpad(i::TEXT, 4, '0'),
                marcas[im] || ' ' || sabores[isb] || ' ' || peso || 'g',
                categorias[ic],
                unidades[1 + (i % array_length(unidades, 1))],
                v_preco,
                round(v_preco * 0.62, 2),
                peso,
                v_est,
                v_min,
                CASE WHEN i % 23 = 0 THEN 2 WHEN i % 31 = 0 THEN 0 ELSE 1 END);
    END LOOP;
END;
$seed$;

ANALYZE produto;

-- ---------------------------------------------------------------------------
-- Sanidade: o catalogo precisa nascer utilizavel
-- ---------------------------------------------------------------------------
DO $chk$
DECLARE n INT; r INT;
BEGIN
    SELECT count(*) INTO n FROM produto;
    IF n < 100 THEN RAISE EXCEPTION 'catalogo veio com apenas % produtos', n; END IF;

    SELECT count(*) INTO r FROM produto WHERE estoque <= estoque_min AND situacao = 1;
    IF r = 0 THEN RAISE EXCEPTION 'nenhum produto em reposicao - alerta ficaria vazio'; END IF;

    RAISE NOTICE 'catalogo ok: % produtos, % precisando de reposicao', n, r;
END;
$chk$;
