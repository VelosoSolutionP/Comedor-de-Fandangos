package br.com.fandangos.util;

import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/**
 * O validador de documento e o portao de entrada do cadastro inteiro.
 * Se ele erra, entra lixo no banco - entao ele tem teste.
 */
public class DocumentosTest {

    // ------------------------------------------------------------------ CPF

    @Test
    public void cpfValidoComEsemMascara() {
        assertTrue(Documentos.valido("529.982.247-25"));
        assertTrue(Documentos.valido("52998224725"));
        assertTrue(Documentos.valido("111.444.777-35"));
        assertTrue(Documentos.valido("390.533.447-05"));
    }

    @Test
    public void cpfComDigitoVerificadorErrado() {
        assertFalse(Documentos.valido("529.982.247-26"));
        assertFalse(Documentos.valido("52998224724"));
        assertFalse(Documentos.valido("111.444.777-30"));
    }

    @Test
    public void cpfComTodosOsDigitosIguaisEhInvalido() {
        assertFalse(Documentos.valido("00000000000"));
        assertFalse(Documentos.valido("11111111111"));
        assertFalse(Documentos.valido("99999999999"));
    }

    // ------------------------------------------------------------------ CNPJ

    @Test
    public void cnpjValidoComEsemMascara() {
        assertTrue(Documentos.valido("11.222.333/0001-81"));
        assertTrue(Documentos.valido("11222333000181"));
        assertTrue(Documentos.valido("34.028.316/0001-03"));
        assertTrue(Documentos.valido("00.000.000/0001-91"));
    }

    @Test
    public void cnpjComDigitoVerificadorErrado() {
        assertFalse(Documentos.valido("11.222.333/0001-82"));
        assertFalse(Documentos.valido("11222333000180"));
        assertFalse(Documentos.valido("34028316000104"));
    }

    @Test
    public void cnpjComTodosOsDigitosIguaisEhInvalido() {
        assertFalse(Documentos.valido("00000000000000"));
        assertFalse(Documentos.valido("11111111111111"));
    }

    // ------------------------------------------------------------------ bordas

    @Test
    public void tamanhoErradoOuEntradaVaziaNaoQuebra() {
        assertFalse(Documentos.valido(null));
        assertFalse(Documentos.valido(""));
        assertFalse(Documentos.valido("123"));
        assertFalse(Documentos.valido("5299822472"));      // 10 digitos
        assertFalse(Documentos.valido("529982247251"));    // 12 digitos
        assertFalse(Documentos.valido("abcdefghijk"));
    }

    @Test
    public void digitosRemoveTudoQueNaoEhNumero() {
        assertEquals("52998224725", Documentos.digitos("529.982.247-25"));
        assertEquals("11222333000181", Documentos.digitos("11.222.333/0001-81"));
        assertEquals("", Documentos.digitos(null));
        assertEquals("", Documentos.digitos("sem numero aqui"));
        assertEquals("123", Documentos.digitos(" 1 a 2 b 3 "));
    }

    @Test
    public void tipoEhDerivadoDoDocumento() {
        assertEquals('F', Documentos.tipo("529.982.247-25"));
        assertEquals('J', Documentos.tipo("11.222.333/0001-81"));
        assertEquals(0, Documentos.tipo("529.982.247-26"));
        assertEquals(0, Documentos.tipo(""));
    }

    @Test
    public void formatarAplicaMascaraCorreta() {
        assertEquals("529.982.247-25", Documentos.formatar("52998224725"));
        assertEquals("11.222.333/0001-81", Documentos.formatar("11222333000181"));
        // tamanho invalido volta so os digitos, sem estourar excecao
        assertEquals("123", Documentos.formatar("123"));
    }
}
