package br.com.fandangos.service;

import br.com.fandangos.repository.ClienteRepository;

import javax.ejb.Stateless;
import javax.ejb.TransactionAttribute;
import javax.ejb.TransactionAttributeType;
import javax.inject.Inject;
import java.time.LocalDate;

/**
 * Existe por um motivo unico: manter as transacoes CURTAS.
 *
 * O LookupService faz uma chamada HTTP externa que pode levar segundos. Se
 * ela rodasse dentro da transacao, cada consulta de CNPJ seguraria uma
 * conexao do pool o tempo todo da rede - com 50 conexoes e 20 usuarios
 * cadastrando ao mesmo tempo, o pool esgota esperando um servidor de fora.
 *
 * Entao o LookupService roda SEM transacao e delega aqui os dois momentos que
 * precisam do banco, cada um abrindo e fechando a sua (REQUIRES_NEW).
 * Chamada entre beans distintos passa pelo proxy do container - por isso e
 * uma classe separada, e nao um metodo privado.
 */
@Stateless
public class LookupPersistencia {

    @Inject
    private ClienteRepository repo;

    @TransactionAttribute(TransactionAttributeType.REQUIRES_NEW)
    public String consultar(String documento) {
        return repo.lookup(documento);
    }

    @TransactionAttribute(TransactionAttributeType.REQUIRES_NEW)
    public void gravarEmpresa(String cnpj, String razao, String fantasia, LocalDate abertura,
                              String situacao, String cep, String logradouro, String numero,
                              String bairro, String cidade, String uf, String telefone, String email) {
        repo.gravarEmpresaPublica(cnpj, razao, fantasia, abertura, situacao, cep,
                logradouro, numero, bairro, cidade, uf, telefone, email);
    }
}
