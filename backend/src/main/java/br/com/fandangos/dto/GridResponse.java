package br.com.fandangos.dto;

import javax.json.bind.annotation.JsonbProperty;
import java.util.List;

/**
 * Resposta COLUNAR do grid.
 *
 * Em vez de repetir o nome de cada campo em cada linha:
 *   [{"id":1,"nome":"..","documento":"..","uf":"SP","tipo":"F","situacao":1}, ...]
 * mandamos o cabecalho uma vez e as linhas como array posicional:
 *   {"c":["id","nm","doc","uf","tp","sit"],"r":[[1,"..","..","SP","F",1]],"t":2000,"p":0,"s":20}
 *
 * Em 20 linhas isso derruba o corpo de ~2,6 KB para ~1,1 KB (-58%) antes do
 * gzip. O front remonta objeto em O(n) no data-grid.
 */
public class GridResponse {

    @JsonbProperty("c")
    private String[] colunas;

    @JsonbProperty("r")
    private List<Object[]> linhas;

    @JsonbProperty("t")
    private long total;

    @JsonbProperty("p")
    private int pagina;

    @JsonbProperty("s")
    private int tamanho;

    public GridResponse() {
    }

    public GridResponse(String[] colunas, List<Object[]> linhas, long total, int pagina, int tamanho) {
        this.colunas = colunas;
        this.linhas = linhas;
        this.total = total;
        this.pagina = pagina;
        this.tamanho = tamanho;
    }

    public String[] getColunas() { return colunas; }
    public void setColunas(String[] colunas) { this.colunas = colunas; }
    public List<Object[]> getLinhas() { return linhas; }
    public void setLinhas(List<Object[]> linhas) { this.linhas = linhas; }
    public long getTotal() { return total; }
    public void setTotal(long total) { this.total = total; }
    public int getPagina() { return pagina; }
    public void setPagina(int pagina) { this.pagina = pagina; }
    public int getTamanho() { return tamanho; }
    public void setTamanho(int tamanho) { this.tamanho = tamanho; }
}
