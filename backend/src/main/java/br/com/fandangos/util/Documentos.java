package br.com.fandangos.util;

/**
 * Validacao e normalizacao de CPF/CNPJ.
 *
 * Sem regex, sem String.replaceAll, sem stream: puro char loop sobre o array.
 * Este metodo roda em TODA digitacao do formulario (via /api/lookup) e em todo
 * POST/PUT de cliente. Alocacao zero no caminho de validacao.
 */
public final class Documentos {

    private Documentos() {
    }

    /** Remove tudo que nao for digito. Retorna "" se nulo. */
    public static String digitos(String s) {
        if (s == null || s.isEmpty()) {
            return "";
        }
        final int n = s.length();
        final char[] out = new char[n];
        int k = 0;
        for (int i = 0; i < n; i++) {
            final char c = s.charAt(i);
            if (c >= '0' && c <= '9') {
                out[k++] = c;
            }
        }
        return k == n ? s : new String(out, 0, k);
    }

    /** true para CPF (11) ou CNPJ (14) com digito verificador correto. */
    public static boolean valido(String doc) {
        final String d = digitos(doc);
        switch (d.length()) {
            case 11: return cpfValido(d);
            case 14: return cnpjValido(d);
            default: return false;
        }
    }

    /** 'F' para CPF, 'J' para CNPJ, 0 se invalido. */
    public static char tipo(String doc) {
        final String d = digitos(doc);
        if (d.length() == 11 && cpfValido(d)) {
            return 'F';
        }
        if (d.length() == 14 && cnpjValido(d)) {
            return 'J';
        }
        return 0;
    }

    /** 000.000.000-00 / 00.000.000/0000-00. Usado so em relatorio/export. */
    public static String formatar(String doc) {
        final String d = digitos(doc);
        if (d.length() == 11) {
            return d.substring(0, 3) + '.' + d.substring(3, 6) + '.' + d.substring(6, 9) + '-' + d.substring(9);
        }
        if (d.length() == 14) {
            return d.substring(0, 2) + '.' + d.substring(2, 5) + '.' + d.substring(5, 8)
                 + '/' + d.substring(8, 12) + '-' + d.substring(12);
        }
        return d;
    }

    // ------------------------------------------------------------------ interno

    private static boolean repetido(String d) {
        final char c = d.charAt(0);
        for (int i = 1; i < d.length(); i++) {
            if (d.charAt(i) != c) {
                return false;
            }
        }
        return true;
    }

    private static boolean cpfValido(String d) {
        if (repetido(d)) {
            return false;
        }
        int s1 = 0;
        int s2 = 0;
        for (int i = 0; i < 9; i++) {
            final int v = d.charAt(i) - '0';
            s1 += v * (10 - i);
            s2 += v * (11 - i);
        }
        final int dv1 = dvMod11(s1);
        if (dv1 != d.charAt(9) - '0') {
            return false;
        }
        s2 += dv1 * 2;
        return dvMod11(s2) == d.charAt(10) - '0';
    }

    private static int dvMod11(int soma) {
        final int r = 11 - (soma % 11);
        return r >= 10 ? 0 : r;
    }

    /** pesos CNPJ: 5,4,3,2,9,8,7,6,5,4,3,2 (e 6,5,4,... para o 2o digito) */
    private static final int[] P1 = {5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2};
    private static final int[] P2 = {6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2};

    private static boolean cnpjValido(String d) {
        if (repetido(d)) {
            return false;
        }
        int s1 = 0;
        for (int i = 0; i < 12; i++) {
            s1 += (d.charAt(i) - '0') * P1[i];
        }
        final int dv1 = dvCnpj(s1);
        if (dv1 != d.charAt(12) - '0') {
            return false;
        }
        int s2 = 0;
        for (int i = 0; i < 12; i++) {
            s2 += (d.charAt(i) - '0') * P2[i];
        }
        s2 += dv1 * P2[12];
        return dvCnpj(s2) == d.charAt(13) - '0';
    }

    private static int dvCnpj(int soma) {
        final int r = soma % 11;
        return r < 2 ? 0 : 11 - r;
    }
}
