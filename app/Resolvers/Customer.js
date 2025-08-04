"use strict";
const { v4: uuidv4 } = require('uuid');

module.exports = {
    Query: {
        searchCustomers: async (_, { searchText }, { MongoDB }) => {
            const searchRegex = new RegExp(searchText, 'i');
            const customers = await MongoDB().collection('customers').find({
                $or: [
                    { name: searchRegex },
                    { phone: searchRegex }
                ]
            }).limit(20).toArray();
            return customers;
        },

        getCustomerDetails: async (_, { id }, context) => {
            try {
                const { MongoDB } = context;

                // 1. Busca o cliente pelo ID. Se não encontrar, lança um erro.
                const customer = await MongoDB().collection('customers').findOne({ _id: id });
                if (!customer) {
                    throw new Error("Cliente não encontrado.");
                }

                // 2. Busca todas as vendas associadas a este cliente, ordenadas pela mais recente
                const salesHistory = await MongoDB().collection('sales').find({ customerId: id })
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

    },

    Mutation: {
        createCustomer: async (_, { input }, { MongoDB }) => {
            const newCustomer = {
                _id: uuidv4(),
                ...input,
                createdAt: new Date(),
            };
            await MongoDB().collection('customers').insertOne(newCustomer);
            return newCustomer;
        },

    }
}