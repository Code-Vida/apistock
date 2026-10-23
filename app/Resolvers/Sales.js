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

            if (!input.items?.length) {
                throw new Error("A venda precisa ter ao menos um item.");
            }
            for (const item of input.items) {
                if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
                    throw new Error(`Quantidade inválida para o produto ID ${item.productId}.`);
                }
                if (!(item.priceAtTimeOfSale >= 0)) {
                    throw new Error(`Preço inválido para o produto ID ${item.productId}.`);
                }
            }

            // Totais recalculados no servidor; o app não é fonte confiável.
            const totalAmount = input.items.reduce((sum, item) => sum + item.priceAtTimeOfSale * item.quantity, 0);
            const discount = input.discount || 0;
            const TOLERANCE = 0.01;
            if (discount < 0 || discount > totalAmount + TOLERANCE) {
                throw new Error("Desconto inválido para o total da venda.");
            }
            // finalAmount pode ser menor que total - desconto quando há uso de crédito da loja.
            if (input.finalAmount < -TOLERANCE || input.finalAmount > totalAmount - discount + TOLERANCE) {
                throw new Error("Valor final inválido para o total da venda.");
            }

            // Reenvio do sync offline: a venda já existe, devolve sem baixar estoque de novo.
            if (input._id) {
                const existingSale = await context.MongoDB(context).collection('sales').findOne({ _id: input._id });
                if (existingSale) return existingSale;
            }

            const session = client.startSession();
            let savedSaleDocument;

            let customer = null
            if(input.customerId){
                customer = await context.MongoDB(context).collection('customers').findOne({ _id: input.customerId, storeId: storeId });
            }
            const storeConfig = await context.MongoDB(context).collection('stores').findOne({ _id: storeId });
            try {
                await session.withTransaction(async () => {
                    const saleItems = [];
                    for (const item of input.items) {
                        const { colorSlug, number } = item.variants;
                        const product = await context.MongoDB(context).collection('products_new').findOne({ _id: item.productId }, { session });
                        const stockItem = product?.variants
                            ?.find(v => v.colorSlug === colorSlug)
                            ?.items?.find(i => i.number === number);

                        if (!stockItem) {
                            throw new Error(`Item não encontrado para o produto ID ${item.productId} (Tamanho: ${number}, Cor: ${colorSlug}). A venda foi cancelada.`);
                        }

                        // Cor e numeração precisam casar na mesma variante, e o $gte no
                        // arrayFilter impede estoque negativo mesmo com vendas concorrentes.
                        const productUpdateResult = await context.MongoDB(context).collection('products_new').updateOne(
                            {
                                _id: item.productId,
                                variants: {
                                    $elemMatch: {
                                        colorSlug,
                                        items: { $elemMatch: { number, amount: { $gte: item.quantity } } }
                                    }
                                }
                            },
                            { $inc: { 'variants.$[v].items.$[i].amount': -item.quantity } },
                            {
                                arrayFilters: [
                                    { 'v.colorSlug': colorSlug },
                                    { 'i.number': number, 'i.amount': { $gte: item.quantity } }
                                ],
                                session
                            }
                        );

                        if (productUpdateResult.modifiedCount === 0) {
                            throw new Error(`Estoque insuficiente para o produto ID ${item.productId} (Tamanho: ${number}, Cor: ${colorSlug}). A venda foi cancelada.`);
                        }

                        saleItems.push({
                            productId: item.productId,
                            variants: { colorSlug, number },
                            quantity: item.quantity,
                            priceAtTimeOfSale: item.priceAtTimeOfSale,
                            costAtTimeOfSale: stockItem.purchaseValue ?? product.purchaseValue ?? 0,
                        });
                    }

                    const activeCashSession = await context.MongoDB(context).collection('cash').findOne({ status: 'OPEN' }, { session });

                    const saleDocument = {
                        _id: input._id || uuid.v4(),
                        createdAt: new Date(),
                        storeId: storeId,
                        userId: user.userId,
                        cashSessionId: activeCashSession?._id ?? null,
                        customerId: input.customerId,
                        totalAmount,
                        paymentMethod: input.paymentMethod,
                        discount,
                        finalAmount: input.finalAmount,
                        items: saleItems,
                        nfceStatus: '',
                        customer: customer,
                    };
                    await context.MongoDB(context).collection('sales').insertOne(saleDocument, { session });

                    if (saleDocument.customerId && storeConfig?.loyaltyProgramSettings?.enabled === true) {
                        const pointsPerDollar = storeConfig.loyaltyProgramSettings.pointsPerDollar || 1;
                        const pointsEarned = Math.floor(saleDocument.finalAmount * pointsPerDollar);

                        if (pointsEarned > 0) {
                            await context.MongoDB(context).collection('customers').updateOne(
                                { _id: saleDocument.customerId },
                                { $inc: { loyaltyPoints: pointsEarned } },
                                { session }
                            );
                            await context.MongoDB(context).collection('loyalty_transactions').insertOne({
                                _id: uuid.v4(),
                                customerId: saleDocument.customerId,
                                storeId: storeId,
                                type: 'earn',
                                points: pointsEarned,
                                description: `Pontos da Venda #${saleDocument._id.substring(0, 8)}`,
                                relatedSaleId: saleDocument._id,
                                createdAt: new Date(),
                            }, { session });
                        }
                    }

                    savedSaleDocument = saleDocument;
                });

                if (!savedSaleDocument) {
                    throw new Error("A transação da venda falhou e foi revertida.");
                }


                if (storeConfig?.hasFiscalModule === true) {
                    if (!storeConfig.cnpj?.trim() || !storeConfig.inscricaoEstadual?.trim()) {
                        console.warn(`Venda ${savedSaleDocument._id}: Módulo fiscal ativo, mas configurações da loja estão incompletas.`);
                    } else {
                        FiscalService.emitirNFCe(savedSaleDocument, storeConfig, context)
                            .catch(err => console.error(`[BG JOB] Erro ao emitir NFC-e para a venda ${savedSaleDocument._id}:`, err.message));
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