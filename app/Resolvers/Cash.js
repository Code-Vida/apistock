"use strict";
const { v4: uuidv4 } = require('uuid');

module.exports = {
    Query: {
        getActiveCashSession: async (_, __, context) => {
            try {
                
                const activeSession = await context.MongoDB(context).collection('cash').findOne({ status: 'OPEN' });
                return activeSession;
            } catch (error) {
                console.error("Erro ao buscar sessão de caixa ativa:", error);
                throw new Error("Não foi possível verificar o status do caixa.");
            }
        },
        getActiveCashSessionSummary: async (_, __, context) => {
            try {
                
                const activeSession = await context.MongoDB(context).collection('cash').findOne({ status: 'OPEN' });
                if (!activeSession) {
                    
                    return null;
                }

                const startDate = activeSession.openedAt;
                const endDate = new Date(); 

                
                const salesSummaryPipeline = [
                    { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
                    { $group: { _id: "$paymentMethod", total: { $sum: "$finalAmount" }, salesCount: { $sum: 1 } } },
                    { $project: { _id: 0, paymentMethod: "$_id", totalAmount: "$total", salesCount: 1 } }
                ];
                const totalSalesByPaymentMethod = await context.MongoDB(context).collection('sales').aggregate(salesSummaryPipeline).toArray();

                
                const movementsSummaryPipeline = [
                    { $match: { sessionId: activeSession._id, createdAt: { $gte: startDate, $lte: endDate } } },
                    { $group: { _id: "$type", total: { $sum: "$amount" } } }
                ];
                const movementsResult = await context.MongoDB(context).collection('cash_movements').aggregate(movementsSummaryPipeline).toArray();

                const totalDeposits = movementsResult.find(m => m._id === 'DEPOSIT')?.total || 0;
                const totalWithdrawals = movementsResult.find(m => m._id === 'WITHDRAWAL')?.total || 0;
                const salesInCash = totalSalesByPaymentMethod.find(p => p.paymentMethod === 'Dinheiro')?.totalAmount || 0;

                
                const expectedBalanceInCash = activeSession.openingBalance + salesInCash + totalDeposits - totalWithdrawals;

                
                return {
                    openingBalance: activeSession.openingBalance,
                    totalSalesByPaymentMethod: totalSalesByPaymentMethod,
                    totalMovements: {
                        deposits: totalDeposits,
                        withdrawals: totalWithdrawals
                    },
                    expectedBalanceInCash: expectedBalanceInCash,
                };

            } catch (error) {
                console.error("Erro ao gerar resumo do caixa ativo:", error);
                throw new Error("Não foi possível carregar o resumo do caixa.");
            }
        },
    },

    Mutation: {
        openCashSession: async (_, { openingBalance }, context) => {
            try {
                const existingSession = await context.MongoDB(context).collection('cash').findOne({ status: 'OPEN' });
                if (existingSession) {
                    throw new Error("Já existe uma sessão de caixa aberta. Feche a sessão atual antes de abrir uma nova.");
                }

                const newSessionDocument = {
                    _id: uuidv4(),
                    openingBalance: openingBalance,
                    status: 'OPEN',
                    openedAt: new Date(),
                    closedAt: null,
                    totalSalesByPaymentMethod: [],
                    totalMovements: { withdrawals: 0, deposits: 0 },
                };

                const result = await context.MongoDB(context).collection('cash').insertOne(newSessionDocument);

                if (!result.insertedId) {
                    throw new Error("Falha ao salvar a nova sessão no banco de dados.");
                }

                console.log(`Caixa aberto com sucesso. ID da Sessão: ${newSessionDocument._id}`);
                return newSessionDocument;

            } catch (error) {
                console.error("Erro ao abrir o caixa:", error);
                throw new Error(error.message || "Não foi possível abrir o caixa.");
            }
        },

        addCashMovement: async (_, { input }, context) => {
            
            const client = context.client;
            const session = client.startSession();

            try {
                let movementResult = false;
                await session.withTransaction(async () => {
                    const activeSession = await context.MongoDB(context).collection('cash').findOne({ status: 'OPEN' }, { session });
                    if (!activeSession) {
                        throw new Error("Nenhuma sessão de caixa está aberta.");
                    }

                    const newMovement = {
                        _id: uuidv4(),
                        sessionId: activeSession._id,
                        type: input.type,
                        amount: input.amount,
                        description: input.description,
                        createdAt: new Date(),
                    };

                    const result = await context.MongoDB(context).collection('cash_movements').insertOne(newMovement, { session });

                    if (!result.insertedId) {
                        throw new Error("Falha ao registrar o movimento de caixa.");
                    }
                    movementResult = true;
                });

                return movementResult;

            } catch (error) {
                console.error("Erro ao adicionar movimento de caixa:", error);
                throw new Error(error.message || "Não foi possível registrar o movimento.");
            } finally {
                await session.endSession();
            }
        },

        closeCashSession: async (_, { input }, context) => {
            const { client } = context;
            const session = client.startSession();

            try {
                let closedSessionDocument; 

                
                await session.withTransaction(async () => {
                    
                    const activeSession = await context.MongoDB(context).collection('cash').findOne({ status: 'OPEN' }, { session });
                    if (!activeSession) {
                        throw new Error("Nenhuma sessão de caixa está aberta para ser fechada.");
                    }

                    const startDate = activeSession.openedAt;
                    const endDate = new Date(); 

                    
                    const salesSummaryPipeline = [
                        { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
                        { $group: { _id: "$paymentMethod", total: { $sum: "$finalAmount" } } },
                        { $project: { _id: 0, paymentMethod: "$_id", total: 1 } }
                    ];
                    const totalSalesByPaymentMethod = await context.MongoDB(context).collection('sales').aggregate(salesSummaryPipeline, { session }).toArray();

                    
                    const movementsSummaryPipeline = [
                        { $match: { sessionId: activeSession._id, createdAt: { $gte: startDate, $lte: endDate } } },
                        { $group: { _id: "$type", total: { $sum: "$amount" } } }
                    ];
                    const movementsResult = await context.MongoDB(context).collection('cash_movements').aggregate(movementsSummaryPipeline, { session }).toArray();

                    const totalDeposits = movementsResult.find(m => m._id === 'DEPOSIT')?.total || 0;
                    const totalWithdrawals = movementsResult.find(m => m._id === 'WITHDRAWAL')?.total || 0;
                    const salesInCash = totalSalesByPaymentMethod.find(p => p.paymentMethod === 'Dinheiro')?.total || 0;

                    
                    const expectedBalance = activeSession.openingBalance + salesInCash + totalDeposits - totalWithdrawals;
                    const difference = input.actualBalance - expectedBalance;

                    
                    const updateResult = await context.MongoDB(context).collection('cash').findOneAndUpdate(
                        { _id: activeSession._id, status: 'OPEN' }, 
                        {
                            $set: {
                                status: 'CLOSED',
                                closedAt: endDate,
                                closingBalance_actual: input.actualBalance,
                                closingBalance_expected: expectedBalance,
                                difference: difference,
                                totalSalesByPaymentMethod: totalSalesByPaymentMethod,
                                totalMovements: {
                                    deposits: totalDeposits,
                                    withdrawals: totalWithdrawals
                                }
                            }
                        },
                        {
                            returnDocument: 'after', 
                            session
                        }
                    );

                    if (!updateResult) {
                        throw new Error("Falha ao fechar a sessão. Pode já ter sido fechada.");
                    }

                    closedSessionDocument = updateResult;
                });

                
                return closedSessionDocument;

            } catch (error) {
                console.error("Erro ao fechar o caixa (transação desfeita):", error);
                throw new Error(error.message || "Não foi possível fechar o caixa.");
            } finally {
                
                await session.endSession();
            }
        },

    }
}