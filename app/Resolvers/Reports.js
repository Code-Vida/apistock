
const { startOfDay, endOfDay, parseISO, startOfMonth, endOfMonth } = require('date-fns'); // Ótima lib para manipular datas

module.exports = {
    Query: {
        getSales: async (_, { startDate, endDate, limit = 20, offset = 0 }, context) => {
            const filter = {};

            // Lógica para filtro de data (continua a mesma)
            if (startDate && endDate) {
                filter.createdAt = {
                    $gte: startOfDay(parseISO(startDate)),
                    $lte: endOfDay(parseISO(endDate))
                };
            } else if (startDate) {
                filter.createdAt = { $gte: startOfDay(parseISO(startDate)) };
            } else if (endDate) {
                filter.createdAt = { $lte: endOfDay(parseISO(endDate)) };
            }

            try {
                // Pipeline de agregação para buscar vendas e enriquecer com dados do produto
                const pipeline = [
                    // 1. Aplica os filtros de data e paginação primeiro para otimizar
                    { $match: filter },
                    { $sort: { createdAt: -1 } },
                    { $skip: offset },
                    { $limit: limit },

                    // 2. Desconstrói o array de itens para processar cada um
                    { $unwind: "$items" },

                    // 3. Faz o "JOIN" com a collection de produtos para buscar os detalhes
                    {
                        $lookup: {
                            from: "products_new", // O nome exato da sua collection de produtos
                            localField: "items.productId",
                            foreignField: "_id",
                            as: "items.productInfo" // Armazena o resultado em um novo campo temporário
                        }
                    },

                    // 4. O lookup retorna um array, então o desconstruímos para ter um objeto
                    { $unwind: "$items.productInfo" },

                    // 5. Reagrupa os itens de volta em suas respectivas vendas
                    {
                        $group: {
                            _id: "$_id",
                            createdAt: { $first: "$createdAt" },
                            totalAmount: { $first: "$totalAmount" },
                            discount: { $first: "$discount" },
                            finalAmount: { $first: "$finalAmount" },
                            paymentMethod: { $first: "$paymentMethod" },
                            items: {
                                $push: { // Adiciona cada item modificado de volta ao array 'items'
                                    productId: "$items.productId",
                                    product: "$items.productInfo", // Anexa o documento completo do produto
                                    variants: "$items.variants",
                                    quantity: "$items.quantity",
                                    priceAtTimeOfSale: "$items.priceAtTimeOfSale",
                                    costAtTimeOfSale: "$items.costAtTimeOfSale"
                                }
                            }
                        }
                    },
                    // 6. Reordena o resultado final, pois o $group pode alterar a ordem
                    { $sort: { createdAt: -1 } }
                ];

                const sales = await context.MongoDB(context).collection('sales').aggregate(pipeline).toArray();
                console.log("Vendas encontradas:", sales);
                return sales;

            } catch (error) {
                console.error("Erro ao buscar histórico de vendas:", error);
                throw new Error("Não foi possível carregar o histórico de vendas.");
            }
        },

        topSellingProducts: async (_, { startDate, endDate, sortBy = "QUANTITY", limit = 10 }, context) => {
            try {
                // Define o campo pelo qual vamos ordenar
                const sortField = sortBy === "REVENUE" ? "totalRevenue" : "totalQuantitySold";

                const pipeline = [
                    // 1. Filtra as vendas pelo período de data desejado
                    {
                        $match: {
                            createdAt: {
                                $gte: startOfDay(parseISO(startDate)),
                                $lte: endOfDay(parseISO(endDate)),
                            },
                        },
                    },
                    // 2. Desconstrói o array de itens para processar cada item individualmente
                    { $unwind: "$items" },
                    // 3. Agrupa por ID do produto, somando a quantidade e a receita
                    {
                        $group: {
                            _id: "$items.productId", // Agrupa pelo ID do produto
                            totalQuantitySold: { $sum: "$items.quantity" },
                            totalRevenue: { $sum: { $multiply: ["$items.priceAtTimeOfSale", "$items.quantity"] } },
                        },
                    },
                    // 4. Ordena os resultados com base no critério escolhido (os maiores primeiro)
                    { $sort: { [sortField]: -1 } },
                    // 5. Limita ao top N (ex: top 10)
                    { $limit: limit },
                    // 6. Junta ("JOIN") com a collection de produtos para buscar brand e model
                    {
                        $lookup: {
                            from: "products", // O nome exato da sua collection de produtos
                            localField: "_id",
                            foreignField: "_id",
                            as: "productInfo",
                        },
                    },
                    // 7. Desconstrói o array resultante do lookup
                    { $unwind: "$productInfo" },
                    // 8. Formata o documento final para corresponder ao tipo GraphQL
                    {
                        $project: {
                            _id: 0, // Exclui o _id do grupo
                            productId: "$_id",
                            brand: "$productInfo.brand",
                            model: "$productInfo.model",
                            totalQuantitySold: 1,
                            totalRevenue: 1,
                        },
                    },
                ];

                const result = await context.MongoDB(context).collection('sales').aggregate(pipeline).toArray();
                return result;

            } catch (error) {
                console.error("Erro ao gerar relatório de mais vendidos:", error);
                throw new Error("Não foi possível gerar o relatório.");
            }
        },

        getProfitabilityReport: async (_, { startDate, endDate }, context) => {
            try {
                const start = startOfDay(parseISO(startDate));
                const end = endOfDay(parseISO(endDate));

                // --- AGREGAÇÃO 1: CALCULAR O RESUMO GERAL ---
                const summaryPipeline = [
                    { $match: { createdAt: { $gte: start, $lte: end } } },
                    { $unwind: "$items" },
                    {
                        $group: {
                            _id: null,
                            totalRevenue: { $sum: { $multiply: ["$items.priceAtTimeOfSale", "$items.quantity"] } },
                            totalCost: { $sum: { $multiply: ["$items.costAtTimeOfSale", "$items.quantity"] } },
                        }
                    }
                ];

                // --- AGREGAÇÃO 2: CALCULAR O RANKING DE PRODUTOS MAIS LUCRATIVOS ---
                const topProductsPipeline = [
                    { $match: { createdAt: { $gte: start, $lte: end } } },
                    { $unwind: "$items" },
                    {
                        $group: {
                            _id: "$items.productId",
                            totalProfit: { $sum: { $multiply: [{ $subtract: ["$items.priceAtTimeOfSale", "$items.costAtTimeOfSale"] }, "$items.quantity"] } },
                            totalQuantitySold: { $sum: "$items.quantity" }
                        }
                    },
                    { $sort: { totalProfit: -1 } },
                    { $limit: 15 }, // Pega os 15 mais lucrativos
                    { $lookup: { from: "products", localField: "_id", foreignField: "_id", as: "productInfo" } },
                    { $unwind: "$productInfo" },
                    {
                        $project: {
                            _id: 0,
                            productId: "$_id",
                            brand: "$productInfo.brand",
                            model: "$productInfo.model",
                            totalProfit: 1,
                            totalQuantitySold: 1
                        }
                    }
                ];

                // Executa as duas agregações em paralelo
                const [summaryResult, topProductsResult] = await Promise.all([
                    context.MongoDB(context).collection('sales').aggregate(summaryPipeline).toArray(),
                    context.MongoDB(context).collection('sales').aggregate(topProductsPipeline).toArray()
                ]);

                // --- COMBINA OS RESULTADOS ---
                let summary = { totalRevenue: 0, totalCost: 0, totalProfit: 0, profitMargin: 0 };
                if (summaryResult.length > 0) {
                    const { totalRevenue, totalCost } = summaryResult[0];
                    const totalProfit = totalRevenue - totalCost;
                    const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
                    summary = { totalRevenue, totalCost, totalProfit, profitMargin };
                }

                return {
                    summary: summary,
                    topProducts: topProductsResult
                };

            } catch (error) {
                console.error("Erro ao gerar relatório de lucratividade:", error);
                throw new Error("Não foi possível gerar o relatório.");
            }
        },

        getDailyCashClosingReport: async (_, { date }, context) => {
            try {
                const targetDate = parseISO(date);
                const startDate = startOfDay(targetDate);
                const endDate = endOfDay(targetDate);

                const pipeline = [
                    // 1. Encontra todas as vendas no intervalo de datas (o dia inteiro)
                    {
                        $match: {
                            createdAt: { $gte: startDate, $lte: endDate }
                        }
                    },
                    // 2. Agrupa os documentos pelo campo 'paymentMethod'
                    {
                        $group: {
                            _id: "$paymentMethod", // Agrupa por forma de pagamento
                            totalAmount: { $sum: "$finalAmount" }, // Soma o valor final de cada venda no grupo
                            salesCount: { $sum: 1 } // Conta quantas vendas existem em cada grupo
                        }
                    },
                    // 3. Ordena por nome do método de pagamento para um resultado consistente
                    {
                        $sort: { _id: 1 }
                    },
                    // 4. Formata o documento de saída para corresponder ao nosso tipo GraphQL
                    {
                        $project: {
                            _id: 0, // Remove o campo _id
                            paymentMethod: "$_id", // Renomeia _id para paymentMethod
                            totalAmount: 1, // Mantém os campos calculados
                            salesCount: 1
                        }
                    }
                ];

                const result = await context.MongoDB(context).collection('sales').aggregate(pipeline).toArray();
                return result;

            } catch (error) {
                console.error("Erro ao gerar relatório de fechamento de caixa:", error);
                throw new Error("Não foi possível gerar o relatório.");
            }
        },

        getInventoryReport: async (_, __, context) => {
            try {
                const pipeline = [
                    // 1. Desconstrói as variantes e depois os itens para ter um documento por SKU
                    { $unwind: "$variants" },
                    { $unwind: "$variants.items" },

                    // 2. Agrupa por produto para calcular os totais de cada produto
                    {
                        $group: {
                            _id: "$_id",
                            brand: { $first: "$brand" },
                            model: { $first: "$model" },
                            totalQuantity: { $sum: "$variants.items.amount" },
                            totalCostValue: { $sum: { $multiply: ["$purchaseValue", "$variants.items.amount"] } },
                            totalSaleValue: { $sum: { $multiply: ["$value", "$variants.items.amount"] } },
                        }
                    },

                    // 3. Agrupa novamente para calcular os totais gerais e criar o array de produtos
                    {
                        $group: {
                            _id: null, // Agrupa todos os documentos de produto em um só
                            grandTotalCostValue: { $sum: "$totalCostValue" },
                            grandTotalSaleValue: { $sum: "$totalSaleValue" },
                            grandTotalItemCount: { $sum: "$totalQuantity" },
                            // Cria o array de produtos com os dados que já agrupamos
                            products: {
                                $push: {
                                    id: "$_id",
                                    brand: "$brand",
                                    model: "$model",
                                    totalQuantity: "$totalQuantity",
                                    totalCostValue: "$totalCostValue",
                                    totalSaleValue: "$totalSaleValue",
                                }
                            }
                        }
                    },

                    // 4. Formata o documento final para corresponder ao nosso tipo GraphQL
                    {
                        $project: {
                            _id: 0,
                            summary: {
                                totalCostValue: "$grandTotalCostValue",
                                totalSaleValue: "$grandTotalSaleValue",
                                totalItemCount: "$grandTotalItemCount"
                            },
                            products: 1 // Mantém o array de produtos
                        }
                    }
                ];

                const result = await context.MongoDB(context).collection('products_new').aggregate(pipeline).toArray();

                // Se não houver produtos, retorna um relatório vazio
                if (result.length === 0) {
                    return {
                        summary: { totalCostValue: 0, totalSaleValue: 0, totalItemCount: 0 },
                        products: []
                    };
                }

                return result[0];

            } catch (error) {
                console.error("Erro ao gerar relatório de inventário:", error);
                throw new Error("Não foi possível gerar o relatório de inventário.");
            }
        },

        getSalesPerformanceReport: async (_, { userId, month, year }, context) => {
            const { user, MongoDB } = context;
            if (!user) throw new Error("Autenticação necessária.");

            const targetUserId = userId || user.userId;
            if (userId && user.role !== 'ADMIN') {
                throw new Error("Apenas administradores podem ver o relatório de outros usuários.");
            }

            const targetDate = (month && year) ? new Date(year, month - 1) : new Date();
            const startDate = startOfMonth(targetDate);
            const endDate = endOfMonth(targetDate);

            // Busca os dados do usuário alvo
            const targetUser = await MongoDB(context).collection('users').findOne({ _id: targetUserId });
            if (!targetUser) throw new Error("Usuário do relatório não encontrado.");

            const commissionRate = targetUser.commissionRate || 0;
            const userGoal = targetUser.monthlyGoal || 0;

            // Calcula as vendas do usuário
            const userSalesPipeline = [
                { $match: { userId: targetUserId, createdAt: { $gte: startDate, $lte: endDate } } },
                { $group: { _id: null, totalSold: { $sum: "$finalAmount" }, salesCount: { $sum: 1 } } }
            ];
            const userResult = await MongoDB(context).collection('sales').aggregate(userSalesPipeline).toArray();
            const totalSoldByUser = userResult[0]?.totalSold || 0;

            // Calcula o progresso e os bônus
            const userGoalProgress = userGoal > 0 ? (totalSoldByUser / userGoal) * 100 : 0;
            let bonusPercentage = 0;
            if (userGoalProgress >= 110) {
                bonusPercentage = 1.10; // Super Bônus
            } else if (userGoalProgress >= 105) {
                bonusPercentage = 1.05; // Bônus
            } else if (userGoalProgress >= 100) {
                bonusPercentage = 1.0;  // Meta 100%
            }

            // Lógica de cálculo de comissão e bônus
            const commissionEarned = (totalSoldByUser * commissionRate) / 100;
            const bonusEarned = bonusPercentage > 0 ? (commissionEarned * bonusPercentage) - commissionEarned : 0;
            const totalCommission = commissionEarned + bonusEarned;

            // Busca dados da loja (já implementado antes)
            const store = await MongoDB(context).collection('stores').findOne({ _id: user.storeId });
            const storeSalesPipeline = [ /* ... */];
            const storeResult = await MongoDB(context).collection('sales').aggregate(storeSalesPipeline).toArray();

            return {
                totalSoldByUser,
                commissionEarned,
                bonusEarned,
                totalCommission,
                salesCountByUser: userResult[0]?.salesCount || 0,
                storeTotalSold: storeResult[0]?.totalSold || 0,
                storeGoal: store.monthlySalesGoal || 0,
                userGoal,
                userGoalProgress,
            };
        },
    }
}