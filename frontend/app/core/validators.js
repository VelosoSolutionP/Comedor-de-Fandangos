/* ============================================================================
 *  validators.js  -  mesmas regras do backend, rodando no navegador.
 *
 *  Duplicacao proposital: validar no cliente evita um round-trip para dizer
 *  "CPF invalido". O backend valida DE NOVO porque o navegador nao e fonte
 *  confiavel - a API tambem atende integracoes.
 * ========================================================================== */
(function (window) {
    'use strict';

    function digitos(s) {
        return (s || '').replace(/\D+/g, '');
    }

    function repetido(d) {
        for (var i = 1; i < d.length; i++) {
            if (d.charAt(i) !== d.charAt(0)) { return false; }
        }
        return true;
    }

    function cpfValido(doc) {
        var d = digitos(doc);
        if (d.length !== 11 || repetido(d)) { return false; }

        var s1 = 0, s2 = 0, i, v;
        for (i = 0; i < 9; i++) {
            v = +d.charAt(i);
            s1 += v * (10 - i);
            s2 += v * (11 - i);
        }
        var dv1 = 11 - (s1 % 11);
        if (dv1 >= 10) { dv1 = 0; }
        if (dv1 !== +d.charAt(9)) { return false; }

        s2 += dv1 * 2;
        var dv2 = 11 - (s2 % 11);
        if (dv2 >= 10) { dv2 = 0; }
        return dv2 === +d.charAt(10);
    }

    var P1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    var P2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

    function cnpjValido(doc) {
        var d = digitos(doc);
        if (d.length !== 14 || repetido(d)) { return false; }

        var s1 = 0, s2 = 0, i;
        for (i = 0; i < 12; i++) {
            s1 += (+d.charAt(i)) * P1[i];
            s2 += (+d.charAt(i)) * P2[i];
        }
        var r1 = s1 % 11;
        var dv1 = r1 < 2 ? 0 : 11 - r1;
        if (dv1 !== +d.charAt(12)) { return false; }

        s2 += dv1 * P2[12];
        var r2 = s2 % 11;
        var dv2 = r2 < 2 ? 0 : 11 - r2;
        return dv2 === +d.charAt(13);
    }

    var UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
               'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

    var Validar = {
        ufs: UFS,
        cpf: cpfValido,
        cnpj: cnpjValido,

        /** Aceita CPF ou CNPJ conforme o tamanho. */
        documento: function (doc) {
            var d = digitos(doc);
            if (d.length === 11) { return cpfValido(d); }
            if (d.length === 14) { return cnpjValido(d); }
            return false;
        },

        /** 'F' | 'J' | null */
        tipoDocumento: function (doc) {
            var d = digitos(doc);
            if (d.length === 11 && cpfValido(d)) { return 'F'; }
            if (d.length === 14 && cnpjValido(d)) { return 'J'; }
            return null;
        },

        email: function (v) {
            if (!v) { return true; }                 // opcional
            return /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(v);
        },

        telefone: function (v) {
            var d = digitos(v);
            if (!d) { return true; }
            return d.length === 10 || d.length === 11;
        },

        cep: function (v) {
            var d = digitos(v);
            return !d || d.length === 8;
        },

        uf: function (v) {
            return !v || UFS.indexOf(String(v).toUpperCase()) >= 0;
        },

        nome: function (v) {
            return !!v && v.trim().length >= 3 && v.trim().length <= 150;
        },

        dataBr: function (v) {
            if (!v) { return true; }
            return window.Mask.dataParaIso(v) !== null;
        },

        /** Nao aceita nascimento no futuro nem gente com mais de 130 anos. */
        dataNascimento: function (v) {
            if (!v) { return true; }
            var iso = window.Mask.dataParaIso(v);
            if (!iso) { return false; }
            var d = new Date(iso + 'T00:00:00');
            var hoje = new Date();
            var limite = new Date();
            limite.setFullYear(hoje.getFullYear() - 130);
            return d <= hoje && d >= limite;
        },

        /**
         * Valida o formulario inteiro de uma vez.
         * Retorna { ok: bool, erros: { campo: 'mensagem' } }
         */
        formularioCliente: function (f) {
            var erros = {};

            if (!Validar.documento(f.doc)) {
                erros.doc = 'CPF/CNPJ invalido';
            }
            if (!Validar.nome(f.nm)) {
                erros.nm = 'Informe o nome completo (min. 3 letras)';
            }
            if (!Validar.email(f.em)) {
                erros.em = 'E-mail invalido';
            }
            if (!Validar.telefone(f.tel)) {
                erros.tel = 'Telefone deve ter DDD + 8 ou 9 digitos';
            }
            if (!Validar.cep(f.cep)) {
                erros.cep = 'CEP deve ter 8 digitos';
            }
            if (!Validar.uf(f.uf)) {
                erros.uf = 'UF invalida';
            }
            if (!Validar.dataNascimento(f.nascBr)) {
                erros.nascBr = 'Data invalida';
            }
            if (f.limNum < 0) {
                erros.lim = 'Limite nao pode ser negativo';
            }

            return { ok: Object.keys(erros).length === 0, erros: erros };
        }
    };

    window.Validar = Validar;

}(window));
