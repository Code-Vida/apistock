const uuid = require("uuid");

module.exports = {
    Query: {

    },
    Mutation: {
        createSale: async (_, { input }, context) => {
            const { client, MongoDB } = context;
            const session = client.startSession();

            try {
                let saleResult = false;
                await session.withTransaction(async () => {
                    // --- ETAPA 1: Salvar o Documento da Venda ---
                    const saleDocument = {
                        _id: uuid.v4(),
                        createdAt: new Date(),
                        customerId: input.customerId,
                        totalAmount: input.totalAmount,
                        paymentMethod: input.paymentMethod,
                        discount: input.discount,
                        finalAmount: input.finalAmount,
                        items: input.items.map(item => ({
                            productId: item.productId,
                            variants: {
                                color: item.variants.color,
                                number: item.variants.number,
                            },
                            quantity: item.quantity,
                            priceAtTimeOfSale: item.priceAtTimeOfSale,
                            costAtTimeOfSale: item.costAtTimeOfSale,
                        })),
                    };
                    await MongoDB().collection('sales').insertOne(saleDocument, { session });

                    // --- ETAPA 2 (CORREÇÃO ROBUSTA): Atualizar o Estoque dos Produtos ---
                    // Usamos um loop com 'for...of' para garantir que as operações 'await' funcionem corretamente.
                    for (const item of input.items) {
                        const productUpdateResult = await MongoDB().collection('products_new').updateOne(
                            {
                                // Filtro principal: encontra o produto e o item específico
                                _id: item.productId,
                                'variants.items': {
                                    $elemMatch: {
                                        number: item.variants.number,
                                        // Garante que só atualize se houver estoque suficiente
                                        amount: { $gte: item.quantity }
                                    }
                                },
                                // Garante que estamos na variante de cor correta
                                'variants.colorSlug': item.variants.colorSlug
                            },
                            // Operação de atualização
                            {
                                $inc: { 'variants.$[v].items.$[i].amount': -item.quantity }
                            },
                            // arrayFilters para direcionar o $inc para o item correto
                            {
                                arrayFilters: [
                                    { 'v.colorSlug': item.variants.colorSlug },
                                    { 'i.number': item.variants.number }
                                ],
                                session // Executa a operação dentro da transação
                            }
                        );

                        // Se 'modifiedCount' for 0, significa que o filtro não encontrou o item
                        // ou que o estoque era insuficiente. A transação deve ser abortada.
                        if (productUpdateResult.modifiedCount === 0) {
                            throw new Error(`Estoque insuficiente ou item não encontrado para o produto ID ${item.productId} (Tamanho: ${item.variants.number}, Cor: ${item.variants.color}). A venda foi cancelada.`);
                        }
                    }

                    saleResult = true;
                });

                return saleResult;

            } catch (error) {
                console.error("Erro na transação de venda, alterações foram desfeitas:", error);
                // A mensagem de erro agora será muito mais específica e útil para o frontend.
                throw new Error(error.message || "Não foi possível concluir a venda. Tente novamente.");
            } finally {
                await session.endSession();
            }
        },
    }
}