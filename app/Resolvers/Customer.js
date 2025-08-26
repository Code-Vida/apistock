"use strict";
const { v4: uuidv4 } = require('uuid');
const { subDays } = require('date-fns');

module.exports = {
    Query: {
        searchCustomers: async (_, { searchText }, context) => {
            const searchRegex = new RegExp(searchText, 'i');
            const customers = await context.MongoDB(context).collection('customers').find({
                $or: [
                    { name: searchRegex },
                    { phone: searchRegex }
                ]
            }).limit(20).toArray();
            return customers;
        },

        getCustomerDetails: async (_, { id }, context) => {
            try {

                // 1. Busca o cliente pelo ID. Se não encontrar, lança um erro.
                const customer = await context.MongoDB(context).collection('customers').findOne({ _id: id });
                if (!customer) {
                    throw new Error("Cliente não encontrado.");
                }

                // 2. Busca todas as vendas associadas a este cliente, ordenadas pela mais recente
                const salesHistory = await context.MongoDB(context).collection('sales').find({ customerId: id })
                    .sort({ createdAt: -1 })
                    .toArray();

                // 3. Calcula os totais e métricas
                let totalSpent = 0;
                salesHistory.forEach(sale => {
                    totalSpent += sale.finalAmount || 0;
                });

                // 4. Monta o objeto final para retornar
                return {
                    customer: customer,
                    totalSpent: totalSpent,
                    totalPurchases: salesHistory.length,
                    lastPurchaseDate: salesHistory.length > 0 ? salesHistory[0].createdAt.toISOString() : null,
                    salesHistory: salesHistory,
                };

            } catch (error) {
                console.error("Erro ao buscar detalhes do cliente:", error);
                throw new Error(error.message || "Não foi possível carregar os detalhes do cliente.");
            }
        },

        getCustomerMarketingReport: async (_, { input }, context) => {
            const { filterType, limit = 20, daysSinceLastPurchase = 90 } = input;

            let pipeline = [];

            if (filterType === 'TOP_BUYERS_VALUE') {
                pipeline = [
                    { $group: { _id: "$customerId", totalSpent: { $sum: "$finalAmount" } } },
                    { $sort: { totalSpent: -1 } },
                    { $limit: limit }
                ];
            } else if (filterType === 'TOP_BUYERS_FREQUENCY') {
                pipeline = [
                    { $group: { _id: "$customerId", totalPurchases: { $sum: 1 } } },
                    { $sort: { totalPurchases: -1 } },
                    { $limit: limit }
                ];
            } else if (filterType === 'AT_RISK') {
                pipeline = [
                    { $sort: { createdAt: -1 } },
                    { $group: { _id: "$customerId", lastPurchaseDate: { $first: "$createdAt" } } },
                    { $match: { lastPurchaseDate: { $lte: subDays(new Date(), daysSinceLastPurchase) } } },
                    { $limit: limit }
                ];
            } else {
                throw new Error("Tipo de filtro de marketing inválido.");
            }

            // Adiciona o $lookup para buscar os detalhes completos dos clientes
            pipeline.push(
                {
                    $lookup: {
                        from: "customers", // O nome da sua collection de clientes
                        localField: "_id",
                        foreignField: "_id",
                        as: "customerInfo"
                    }
                },
                { $unwind: "$customerInfo" },
                { $replaceRoot: { newRoot: "$customerInfo" } } // Substitui a raiz pelo documento do cliente
            );

            try {
                const customers = await context.MongoDB(context).collection('sales').aggregate(pipeline).toArray();
                return customers;
            } catch (error) {
                console.error("Erro ao gerar relatório de marketing:", error);
                throw new Error("Não foi possível gerar o relatório.");
            }
        },
    },

    Mutation: {
        createCustomer: async (_, { input }, context) => {
            const newCustomer = {
                _id: uuidv4(),
                ...input,
                createdAt: new Date(),
            };
            await context.MongoDB(context).collection('customers').insertOne(newCustomer);
            return newCustomer;
        },

    }
}