const uuid = require("uuid");

module.exports = {
    Query: {

    },
    Mutation: {
        async createSale(_, { input }, context) {
            // MUDANÇA: O client agora vem do contexto, injetado pelo Apollo Server.
            const session = context.client.startSession();

            try {
                const transactionResult = await session.withTransaction(async () => {
                    const saleDocument = {
                        _id: uuid.v4(), // Assumindo que 'uuid' está importado no topo do arquivo
                        createdAt: new Date(),
                        totalAmount: input.totalAmount,
                        paymentMethod: input.paymentMethod,
                        discount: input.discount,
                        finalAmount: input.finalAmount,
                        customerId: input.customerId,
                        items: input.items.map(item => ({
                            productId: item.productId,
                            variants: {
                                // ATENÇÃO: Verifique se o frontend está enviando 'item.variants.color' e 'item.variants.number'
                                // ou se os campos são 'item.colorSlug' e 'item.number' como antes.
                                // Ajuste os nomes abaixo para corresponder ao que o frontend envia.
                                color: item.variants.color,
                                number: item.variants.number
                            },
                            quantity: item.quantity,
                            priceAtTimeOfSale: item.priceAtTimeOfSale,
                            costAtTimeOfSale: item.costAtTimeOfSale,
                        }))
                    };

                    // MUDANÇA: A função MongoDB() também vem do contexto.
                    await context.MongoDB().collection('sales').insertOne(saleDocument, { session });

                    const stockUpdateOperations = input.items.map(item => ({
                        updateOne: {
                            filter: { _id: item.productId },
                            update: { $inc: { "variants.$[variant].items.$[item].amount": -item.quantity } },
                            arrayFilters: [
                                // Ajuste os nomes aqui também para corresponder ao que o frontend env-a
                                { "variant.colorSlug": item.variants.color },
                                { "item.number": item.variants.number }
                            ]
                        }
                    }));

                    if (stockUpdateOperations.length > 0) {
                        // MUDANÇA: Usando o MongoDB() do contexto.
                        // ATENÇÃO: Verifique o nome da sua collection de produtos.
                        await context.MongoDB().collection('products').bulkWrite(stockUpdateOperations, { session });
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