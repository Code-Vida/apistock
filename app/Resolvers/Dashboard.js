"use strict";
const { MongoDB } = require("../database");
const { startOfDay, endOfDay, parseISO } = require('date-fns'); // Biblioteca para lidar com datas


module.exports = {
    Query: {
        dashboardSummary: async (_, { date }) => {
            // Se nenhuma data for fornecida, usa a data de hoje.
            const targetDate = date ? parseISO(date) : new Date();

            const startDate = startOfDay(targetDate);
            const endDate = endOfDay(targetDate);

            // Pipeline de agregação para calcular os totais
            const summaryPipeline = [
                {
                    // 1. Encontra todas as vendas no intervalo de datas
                    $match: {
                        createdAt: { $gte: startDate, $lte: endDate }
                    }
                },
                {
                    // 2. Agrupa tudo em um único resultado para somar
                    $group: {
                        _id: null, // Agrupa todos os documentos encontrados
                        totalSalesToday: { $sum: "$finalAmount" }, // Soma o valor total de cada venda
                        salesCountToday: { $sum: 1 }, // Conta o número de documentos (vendas)
                        itemsSoldToday: { $sum: { $sum: "$items.quantity" } } // Soma a quantidade de todos os itens em todas as vendas
                    }
                }
            ];

            const result = await MongoDB().collection("sales").aggregate(summaryPipeline).toArray();

            // Se não houver vendas, retorna um objeto com zeros
            if (result.length === 0) {
                return { totalSalesToday: 0, itemsSoldToday: 0, salesCountToday: 0 };
            }

            return result[0];
        },

        // RESOLVER PARA PRODUTOS COM BAIXO ESTOQUE
        lowStockProducts: async (_, { limit = 5, threshold = 10 }) => {
            // Pipeline para encontrar produtos com estoque baixo
            const lowStockPipeline = [
                // 1. Desconstrói o array de variantes para processar cada uma
                { $unwind: "$variants" },
                // 2. Desconstrói o array de itens para processar cada tamanho
                { $unwind: "$variants.items" },
                // 3. Agrupa por produto para somar o estoque de todos os tamanhos/cores
                {
                    $group: {
                        _id: "$_id",
                        brand: { $first: "$brand" }, // Pega o primeiro valor encontrado para os campos do produto
                        model: { $first: "$model" },
                        totalStock: { $sum: "$variants.items.amount" } // Soma o estoque de cada item
                    }
                },
                // 4. Filtra apenas os produtos cujo estoque total está abaixo do limite
                {
                    $match: {
                        totalStock: { $lte: threshold },
                        lowStockAcknowledgedAt: { $eq: null }
                    }
                },
                // 5. Ordena para mostrar os mais críticos primeiro
                { $sort: { totalStock: 1 } },
                // 6. Limita o número de resultados
                { $limit: limit },
                // 7. Renomeia o campo _id para id para corresponder ao schema GraphQL
                {
                    $project: {
                        _id: 0,
                        id: "$_id",
                        brand: 1,
                        model: 1,
                        totalStock: 1
                    }
                }
            ];

            const result = await MongoDB().collection("products_new").aggregate(lowStockPipeline).toArray();
            return result;
        }
    },
};
