const uuid = require("uuid");
const FiscalService = require('../services/FiscalService');


module.exports = {
    Query: {

    },
    Mutation: {
        createSale: async (_, { input }, context) => {
            const { client, user } = context;
            const { storeId } = user;

            if (!storeId) {
                throw new Error("Acesso negado: O usuário não está associado a uma loja.");
            }

            const session = client.startSession();
            let savedSaleDocument;

            let customer = null
            if(input.customerId){
                customer = await context.MongoDB(context).collection('customers').findOne({ _id: input.customerId, storeId: storeId });
            }
            try {
                await session.withTransaction(async () => {
                    const saleDocument = {
                        _id: input._id || uuid.v4(),
                        createdAt: new Date(),
                        storeId: storeId,
                        userId: user.userId,
                        customerId: input.customerId,
                        totalAmount: input.totalAmount,
                        paymentMethod: input.paymentMethod,
                        discount: input.discount,
                        finalAmount: input.finalAmount,
                        items: input.items.map(item => ({
                            productId: item.productId,
                            variants: {
                                colorSlug: item.variants.colorSlug,
                                number: item.variants.number,
                            },
                            quantity: item.quantity,
                            priceAtTimeOfSale: item.priceAtTimeOfSale,
                        })),
                        nfceStatus: '',
                        customer: customer,
                    };
                    await context.MongoDB(context).collection('sales').insertOne(saleDocument, { session });
                    savedSaleDocument = saleDocument;

                    for (const item of input.items) {
                        const productUpdateResult = await context.MongoDB(context).collection('products_new').updateOne(
                            {
                                _id: item.productId,
                                'variants.items': {
                                    $elemMatch: {
                                        number: item.variants.number,
                                        amount: { $gte: item.quantity }
                                    }
                                },
                                'variants.colorSlug': item.variants.colorSlug
                            },
                            { $inc: { 'variants.$[v].items.$[i].amount': -item.quantity } },
                            {
                                arrayFilters: [
                                    { 'v.colorSlug': item.variants.colorSlug },
                                    { 'i.number': item.variants.number }
                                ],
                                session
                            }
                        );

                        if (productUpdateResult.modifiedCount === 0) {
                            throw new Error(`Estoque insuficiente ou item não encontrado para o produto ID ${item.productId} (Tamanho: ${item.variants.number}, Cor: ${item.variants.colorSlug}). A venda foi cancelada.`);
                        }
                    }
                });

                if (!savedSaleDocument) {
                    throw new Error("A transação da venda falhou e foi revertida.");
                }


                const storeConfig = await context.MongoDB(context).collection('stores').findOne({ _id: storeId });


                if (storeConfig?.hasFiscalModule === true) {
                    if (!storeConfig.cnpj?.trim() || !storeConfig.inscricaoEstadual?.trim()) {
                        console.warn(`Venda ${savedSaleDocument._id}: Módulo fiscal ativo, mas configurações da loja estão incompletas.`);
                    } else {
                        console.log(`Venda ${savedSaleDocument._id} salva. Disparando emissão de NFC-e...`);
                        FiscalService.emitirNFCe(savedSaleDocument, storeConfig, context)
                            .catch(err => console.error(`[BG JOB] Erro ao emitir NFC-e para a venda ${savedSaleDocument._id}:`, err.message));
                    }
                }


                if (savedSaleDocument.customerId && storeConfig?.loyaltyProgramSettings?.enabled === true) {
                    try {
                        const pointsPerDollar = storeConfig.loyaltyProgramSettings.pointsPerDollar || 1;
                        const pointsEarned = Math.floor(savedSaleDocument.finalAmount * pointsPerDollar);

                        if (pointsEarned > 0) {
                            await context.MongoDB(context).collection('customers').updateOne(
                                { _id: savedSaleDocument.customerId },
                                { $inc: { loyaltyPoints: pointsEarned } }
                            );
                            await context.MongoDB(context).collection('loyalty_transactions').insertOne({
                                _id: uuid.v4(),
                                customerId: savedSaleDocument.customerId,
                                storeId: storeId,
                                type: 'earn',
                                points: pointsEarned,
                                description: `Pontos da Venda #${savedSaleDocument._id.substring(0, 8)}`,
                                relatedSaleId: savedSaleDocument._id,
                                createdAt: new Date(),
                            });
                            console.log(`[FIDELIDADE] ${pointsEarned} pontos adicionados ao cliente ${savedSaleDocument.customerId}`);
                        }
                    } catch (loyaltyError) {
                        console.error(`[FIDELIDADE] Erro ao processar pontos para a venda ${savedSaleDocument._id}:`, loyaltyError);
                    }
                }


                return savedSaleDocument;

            } catch (error) {
                console.error("Erro na transação de venda. As alterações foram desfeitas (rollback).", error);
                throw new Error(error.message || "Não foi possível concluir a venda. Tente novamente.");
            } finally {
                await session.endSession();
            }
        },

        setUserCommissionRate: async (_, { userId, rate }, context) => {
            const { user, MongoDB } = context;
            if (user.role !== 'ADMIN') throw new Error("Apenas administradores podem definir comissões.");

            const userToUpdate = await MongoDB(context).collection('users').findOne({ _id: userId });
            if (!userToUpdate || userToUpdate.storeId !== user.storeId) {
                throw new Error("Usuário não encontrado nesta loja.");
            }

            const result = await MongoDB(context).collection('users').findOneAndUpdate(
                { _id: userId },
                { $set: { commissionRate: rate } },
                { returnDocument: 'after' }
            );
            return result;
        },

        setMonthlySalesGoal: async (_, { goal }, context) => {
            const { user, MongoDB } = context;
            if (user.role !== 'ADMIN') throw new Error("Apenas administradores podem definir metas.");

            const result = await MongoDB(context).collection('stores').findOneAndUpdate(
                { _id: user.storeId },
                { $set: { monthlySalesGoal: goal } },
                { returnDocument: 'after' }
            );
            return result;
        },
        setUserSalesGoal: async (_, { userId, goal }, context) => {
            const { user, MongoDB } = context;
            if (user.role !== 'ADMIN') throw new Error("Apenas administradores podem definir metas.");


            const result = await MongoDB(context).collection('users').findOneAndUpdate(
                { _id: userId, storeId: user.storeId },
                { $set: { monthlyGoal: goal } },
                { returnDocument: 'after' }
            );
            if (!result) throw new Error("Usuário não encontrado.");
            return result;
        },
    }
}