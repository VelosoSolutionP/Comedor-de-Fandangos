package br.com.fandangos.util;

/** Normalizacoes baratas usadas no caminho quente (sem regex). */
public final class Textos {

    private Textos() {
    }

    public static String trimOuNulo(String s) {
        if (s == null) {
            return null;
        }
        final String t = s.trim();
        return t.isEmpty() ? null : t;
    }

    public static String limitar(String s, int max) {
        if (s == null) {
            return null;
        }
        return s.length() <= max ? s : s.substring(0, max);
    }

    public static String upper2(String s) {
        final String t = trimOuNulo(s);
        return t == null ? null : t.toUpperCase();
    }

    /** email valido "o suficiente" - a validacao dura fica no CHECK do banco. */
    public static boolean emailOk(String s) {
        if (s == null) {
            return true;
        }
        final int at = s.indexOf('@');
        final int dot = s.lastIndexOf('.');
        return at > 0 && dot > at + 1 && dot < s.length() - 2 && s.indexOf(' ') < 0;
    }
}
