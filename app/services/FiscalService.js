const axios = require('axios');


const FOCUS_NFE_BASE_URL = 'https://homologacao.focusnfe.com.br';

// eslint-disable-next-line no-undef
const API_TOKEN = process.env.FOCUS_NFE_TOKEN_HOMOLOGACAO || 'SEU_TOKEN_DE_TESTES_AQUI';

/**
 * Classe de serviço para lidar com todas as operações fiscais via API da FocusNFe.
 */
class FiscalService {

    /**
     * Inicia o processo de emissão de uma NFC-e.
     * Atualiza o status da venda e agenda uma consulta para verificar o resultado.
     * @param {object} saleDocument - O documento da venda, vindo do MongoDB.
     * @param {object} storeConfig - As configurações da loja, incluindo dados fiscais.
     * @param {object} context - O contexto do GraphQL para acesso ao DB.
     */
    static async emitirNFCe(saleDocument, storeConfig, context) {
        const saleId = saleDocument._id;
        const { MongoDB } = context;

        try {            
            await MongoDB(context).collection('sales').updateOne(
                { _id: saleId },
                { $set: { nfceStatus: 'processando' } }
            );

            
            const nfeJson = this._mapSaleToNFCeJson(saleDocument, storeConfig);

            
            const url = `${FOCUS_NFE_BASE_URL}/v2/nfce?ref=${saleId}`;

            
            const response = await axios.post(url, nfeJson, {
                auth: { username: API_TOKEN } 
            });

            
            if (response.status === 202) {  
                setTimeout(() => this.consultarStatusNFCe(saleId, context), 8000); 
            } else {
                throw new Error(`Resposta inesperada da API: ${response.status} - ${response.data}`);
            }

        } catch (error) {
            
            const errorMessage = error.response?.data?.mensagem || error.message;
            console.error(`[FiscalService] Falha CRÍTICA ao emitir NFC-e para venda ${saleId}:`, errorMessage);

            await MongoDB(context).collection('sales').updateOne(
                { _id: saleId },
                { $set: { nfceStatus: 'erro_envio', nfceRejectionReason: errorMessage } }
            );
        }
    }

    /**
     * Consulta o status de uma NFC-e que está sendo processada.
     * Atualiza o documento da venda com o resultado final (autorizada ou rejeitada).
     * @param {string} saleId - O ID da venda (que foi usado como 'ref').
     * @param {object} context - O contexto do GraphQL para acesso ao DB.
     */
    static async consultarStatusNFCe(saleId, context) {
        const { MongoDB } = context;
        try {
            const url = `${FOCUS_NFE_BASE_URL}/v2/nfe/${saleId}`;
            const response = await axios.get(url, {
                auth: { username: API_TOKEN }
            });

            const data = response.data;
            let updatePayload = {};

            
            switch (data.status) {
                case 'autorizada':
                    updatePayload = {
                        nfceStatus: 'autorizada',
                        nfcePdfUrl: data.caminho_danfe,
                        nfceXmlUrl: data.caminho_xml_nota_fiscal,
                    };
                    break;
                case 'rejeitada':
                    updatePayload = {
                        nfceStatus: 'rejeitada',
                        nfceRejectionReason: data.motivo_rejeicao,
                    };
                    console.warn(`[FiscalService] Venda ${saleId} REJEITADA: ${data.motivo_rejeicao}`);
                    break;
                case 'processando':
                    setTimeout(() => this.consultarStatusNFCe(saleId, context), 10000);
                    return; 
                default:
                    throw new Error(`Status não esperado: ${data.status}`);
            }

            await MongoDB(context).collection('sales').updateOne(
                { _id: saleId },
                { $set: updatePayload }
            );

        } catch (error) {
            const errorMessage = error.response?.data?.mensagem || error.message;
            console.error(`[FiscalService] Falha ao CONSULTAR NFC-e para venda ${saleId}:`, errorMessage);

            await MongoDB(context).collection('sales').updateOne(
                { _id: saleId },
                { $set: { nfceStatus: 'erro_consulta', nfceRejectionReason: errorMessage } }
            );
        }
    }

    /**
     * Mapeia um documento de Venda e Configuração da Loja para o formato JSON da NFC-e.
     * @private
     */
    // eslint-disable-next-line no-unused-vars
    static _mapSaleToNFCeJson(saleDocument, storeConfig) {
        return {
            "cnpj_emitente": "46391493000139",
            "data_emissao": "2015-11-19T13:54:31-02:00",
            "indicador_inscricao_estadual_destinatario": "9",
            "modalidade_frete": "9",
            "local_destino": "1",
            "presenca_comprador": "1",
            "natureza_operacao": "VENDA AO CONSUMIDOR",
            "items": [
                {
                    "numero_item": "1",
                    "codigo_ncm": "62044200",
                    "quantidade_comercial": "1.00",
                    "quantidade_tributavel": "1.00",
                    "cfop": "5102",
                    "valor_unitario_tributavel": "79.00",
                    "valor_unitario_comercial": "79.00",
                    "valor_desconto": "0.00",
                    "descricao": "NOTA FISCAL EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL",
                    "codigo_produto": "251887",
                    "icms_origem": "0",
                    "icms_situacao_tributaria": "102",
                    "unidade_comercial": "un",
                    "unidade_tributavel": "un",
                    "valor_total_tributos": "24.29"
                }
            ],
            "formas_pagamento": [
                {
                    "forma_pagamento": "03",
                    "valor_pagamento": "79.00",
                    "nome_credenciadora": "Cielo",
                    "bandeira_operadora": "02",
                    "numero_autorizacao": "R07242"
                }
            ]
        }
        // return {
        //     'natureza_operacao': 'Venda de mercadoria',
        //     'data_emissao': saleDocument.createdAt.toISOString(),
        //     'tipo_documento': '1',
        //     'finalidade_emissao': '1',
        //     'cnpj_emitente': storeConfig.cnpj.replace(/\D/g, ''), 
        //     'inscricao_estadual_emitente': storeConfig.inscricaoEstadual.replace(/\D/g, ''),
        //     'regime_tributario_emitente': '1', 
        //     'nome_emitente': storeConfig.razaoSocial,
        //     'logradouro_emitente': storeConfig.endereço.logradouro,
        //     'numero_emitente': storeConfig.endereço.numero,
        //     'bairro_emitente': storeConfig.endereço.bairro,
        //     'municipio_emitente': storeConfig.endereço.municipio,
        //     'uf_emitente': storeConfig.endereço.uf,
        //     'cep_emitente': storeConfig.endereço.cep.replace(/\D/g, ''),
        //     'items': saleDocument.items.map((item, index) => ({
        //         'numero_item': index + 1,
        //         'codigo_produto': item.productId,
        //         'descricao': `${item.brand} ${item.model}`,
        //         'ncm': item.ncm,
        //         'cfop': '5102', 
        //         'unidade_comercial': 'UN',
        //         'quantidade_comercial': item.quantity,
        //         'valor_unitario_comercial': item.priceAtTimeOfSale,
        //         'unidade_tributavel': 'UN',
        //         'quantidade_tributavel': item.quantity,
        //         'valor_unitario_tributavel': item.priceAtTimeOfSale,
        //         'icms_origem': item.origem.toString(),
        //         'icms_situacao_tributaria': '102', 
        //     })),
        //     'formas_pagamento': [{
                
                
        //         'forma_pagamento': '01',
        //         'valor_pagamento': saleDocument.finalAmount,
        //     }],
        // };
    }
}

module.exports = FiscalService;