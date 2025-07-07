const { MongoDB, client } = require("../database");
const uuid = require("uuid");



module.exports = {
    Mutation: {
        async createSale(_, { input }) {
            // O client vem diretamente do seu módulo de conexão!
            const session = client.startSession();

            try {
                const transactionResult = await session.withTransaction(async () => {
                    const saleDocument = {
                        _id: uuid.v4(),
                        createdAt: new Date(),
                        totalAmount: input.totalAmount,
                        paymentMethod: input.paymentMethod,
                        discount: input.discount,
                        finalAmount: input.finalAmount,
                        items: input.items.map(item => ({
                            productId: item.productId,
                            colorSlug: item.colorSlug,
                            number: item.number,
                            quantity: item.quantity,
                            priceAtTimeOfSale: item.priceAtTimeOfSale,
                            costAtTimeOfSale: item.costAtTimeOfSale,
                        }))
                    };

                    // Agora usamos seu helper, passando a { session } nas options
                    await MongoDB().collection('sales').insertOne(saleDocument, { session });

                    const stockUpdateOperations = input.items.map(item => ({
                        updateOne: {
                            filter: { _id: item.productId },
                            update: { $inc: { "variants.$[variant].items.$[item].amount": -item.quantity } },
                            arrayFilters: [
                                { "variant.colorSlug": item.colorSlug },
                                { "item.number": item.number }
                            ]
                        }
                    }));

                    if (stockUpdateOperations.length > 0) {
                        // Usamos o novo método bulkWrite no seu helper, passando a { session }
                        await MongoDB().collection('products_new').bulkWrite(stockUpdateOperations, { session });
                    }
                });

                if (transactionResult) {
                    console.log("Venda e atualização de estoque concluídas com sucesso.");
                    return true;
                } else {
                    console.log("A transação foi abortada.");
                    return false;
                }
            } catch (error) {
                console.error("Erro na transação, alterações foram desfeitas:", error);
                throw new Error("Não foi possível concluir a venda. Tente novamente.");
            } finally {
                await session.endSession();
            }
        }
    }
}