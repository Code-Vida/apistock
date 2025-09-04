const uuid = require("uuid"); 
const FiscalService = require('../services/FiscalService'); // O serviço que criamos


module.exports = {
    Query: {

    },
    Mutation: {
        createSale: async (_, { input }, context) => {
            const { client, user } = context;

            // Garante que o usuário está associado a uma loja
            const { storeId } = user;
            if (!storeId) {
                throw new Error("Acesso negado: O usuário não está associado a uma loja.");
            }

            const session = client.startSession();

            let savedSaleDocument;
            let storeConfig;

            try {
                // A transação garante que a venda e a baixa de estoque ocorram juntas ou nenhuma delas.
                await session.withTransaction(async () => {
                    // --- ETAPA 1: Salvar o Documento da Venda ---
                    const saleDocument = {
                        _id: uuid.v4(),
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
                            // ATENÇÃO: Verifique se os nomes dos campos aqui batem com seu input
                            variants: {
                                colorSlug: item.variants.colorSlug,
                                number: item.variants.number,
                            },
                            quantity: item.quantity,
                            priceAtTimeOfSale: item.priceAtTimeOfSale,
                            brand: item.brand,
                            model: item.model,
                            ncm: item.ncm,
                            origem: item.origem,
                        })),
                        nfceStatus: 'pendente', // Status fiscal inicial
                    };
                    await context.MongoDB(context).collection('sales').insertOne(saleDocument, { session });

                    // Guarda a referência ao documento salvo para usar fora da transação
                    savedSaleDocument = saleDocument;

                    // --- ETAPA 2: Atualizar o Estoque dos Produtos ---
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
                            {
                                $inc: { 'variants.$[v].items.$[i].amount': -item.quantity }
                            },
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

                // Se a transação falhou, savedSaleDocument será nulo e um erro já terá sido lançado.
                if (!savedSaleDocument) {
                    throw new Error("A transação da venda falhou e foi revertida.");
                }

                // --- ETAPA 3: O "PORTEIRO" FISCAL ---
                // Após a transação ser confirmada, buscamos a configuração da loja.
                storeConfig = await context.MongoDB(context).collection('stores').findOne({ _id: storeId });

                // O "interruptor" do módulo fiscal está ligado para esta loja?
                if (storeConfig && storeConfig.hasFiscalModule === true) {

                    // Verificação extra: A loja configurou os dados mínimos?
                    if (!storeConfig.cnpj?.trim() || !storeConfig.inscricaoEstadual?.trim()) {
                        // Apenas um aviso no console, a venda já foi salva.
                        // O app pode depois mostrar um alerta para o lojista.
                        console.warn(`Venda ${savedSaleDocument._id}: Módulo fiscal ativo, mas configurações da loja estão incompletas. A nota não será emitida.`);
                    } else {
                        // --- ETAPA 4: Disparar a Emissão (Apenas se autorizado) ---
                        console.log(`Venda ${savedSaleDocument._id} salva. Cliente tem módulo fiscal. Disparando emissão em segundo plano...`);

                        // Chamamos o serviço de forma assíncrona ("fire-and-forget")
                        // para não travar a resposta para o frontend.
                        FiscalService.emitirNFCe(savedSaleDocument, storeConfig, context)
                            .catch(err => {
                                // Se a emissão falhar, apenas registramos o erro no console do servidor.
                                // A venda em si não é desfeita.
                                console.error(`[BACKGROUND JOB] Erro ao iniciar emissão para a venda ${savedSaleDocument._id}:`, err.message);
                            });
                    }
                } else {
                    // Se o cliente não tem o módulo, simplesmente registramos e seguimos.
                    console.log(`Venda ${savedSaleDocument._id} salva. Cliente não possui módulo fiscal ativo. Nenhuma nota será emitida.`);
                }

                // Retorna o documento completo da venda para o frontend.
                return true;

            } catch (error) {
                console.error("Erro na transação de venda. As alterações foram desfeitas (rollback).", error);
                // Propaga a mensagem de erro específica para o frontend
                throw new Error(error.message || "Não foi possível concluir a venda. Tente novamente.");
            } finally {
                // Garante que a sessão do MongoDB seja sempre encerrada.
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

            // Lógica para encontrar e atualizar o usuário...
            const result = await MongoDB(context).collection('users').findOneAndUpdate(
                { _id: userId, storeId: user.storeId }, // Garante que o admin só edite usuários da sua loja
                { $set: { monthlyGoal: goal } },
                { returnDocument: 'after' }
            );
            if (!result) throw new Error("Usuário não encontrado.");
            return result;
        },
    }
}