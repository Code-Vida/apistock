const { startOfDay, endOfDay, parseISO, startOfMonth, endOfMonth } = require('date-fns'); 

module.exports = {
    Query: {
        getSales: async (_, { startDate, endDate, limit = 20, offset = 0 }, context) => {
            const filter = {};

            
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
                
                const pipeline = [
                    
                    { $match: filter },
                    { $sort: { createdAt: -1 } },
                    { $skip: offset },
                    { $limit: limit },

                    
                    { $unwind: "$items" },

                    
                    {
                        $lookup: {
                            from: "products_new", 
                            localField: "items.productId",
                            foreignField: "_id",
                            as: "items.productInfo" 
                        }
                    },

                    
                    { $unwind: "$items.productInfo" },

                    
                    {
                        $group: {
                            _id: "$_id",
                            createdAt: { $first: "$createdAt" },
                            totalAmount: { $first: "$totalAmount" },
                            discount: { $first: "$discount" },
                            finalAmount: { $first: "$finalAmount" },
                            paymentMethod: { $first: "$paymentMethod" },
                            items: {
                                $push: { 
                                    productId: "$items.productId",
                                    product: "$items.productInfo", 
                                    variants: "$items.variants",
                                    quantity: "$items.quantity",
                                    priceAtTimeOfSale: "$items.priceAtTimeOfSale",
                                    costAtTimeOfSale: "$items.costAtTimeOfSale"
                                }
                            }
                        }
                    },
                    
                    { $sort: { createdAt: -1 } }
                ];

                const sales = await context.MongoDB(context).collection('sales').aggregate(pipeline).toArray();
                return sales;

            } catch (error) {
                console.error("Erro ao buscar histórico de vendas:", error);
                throw new Error("Não foi possível carregar o histórico de vendas.");
            }
        },

        topSellingProducts: async (_, { startDate, endDate, sortBy = "QUANTITY", limit = 10 }, context) => {
            try {
                
                const sortField = sortBy === "REVENUE" ? "totalRevenue" : "totalQuantitySold";

                const pipeline = [
                    
                    {
                        $match: {
                            createdAt: {
                                $gte: startOfDay(parseISO(startDate)),
                                $lte: endOfDay(parseISO(endDate)),
                            },
                        },
                    },
                    
                    { $unwind: "$items" },
                    
                    {
                        $group: {
                            _id: "$items.productId", 
                            totalQuantitySold: { $sum: "$items.quantity" },
                            totalRevenue: { $sum: { $multiply: ["$items.priceAtTimeOfSale", "$items.quantity"] } },
                        },
                    },
                    
                    { $sort: { [sortField]: -1 } },
                    
                    { $limit: limit },
                    
                    {
                        $lookup: {
                            from: "products_new", 
                            localField: "_id",
                            foreignField: "_id",
                            as: "productInfo",
                        },
                    },
                    
                    { $unwind: { path: "$productInfo", preserveNullAndEmptyArrays: true } },
                    
                    {
                        $project: {
                            _id: 0, 
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
                    { $limit: 15 }, 
                    { $lookup: { from: "products_new", localField: "_id", foreignField: "_id", as: "productInfo" } },
                    { $unwind: { path: "$productInfo", preserveNullAndEmptyArrays: true } },
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

                
                const [summaryResult, topProductsResult] = await Promise.all([
                    context.MongoDB(context).collection('sales').aggregate(summaryPipeline).toArray(),
                    context.MongoDB(context).collection('sales').aggregate(topProductsPipeline).toArray()
                ]);

                
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
                    
                    {
                        $match: {
                            createdAt: { $gte: startDate, $lte: endDate }
                        }
                    },
                    
                    {
                        $group: {
                            _id: "$paymentMethod", 
                            totalAmount: { $sum: "$finalAmount" }, 
                            salesCount: { $sum: 1 } 
                        }
                    },
                    
                    {
                        $sort: { _id: 1 }
                    },
                    
                    {
                        $project: {
                            _id: 0, 
                            paymentMethod: "$_id", 
                            totalAmount: 1, 
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

        getInventoryReport: async (_, { search }, context) => {
            try {
                const pipeline = [
                    ...(search ? [{ $match: { $or: [{ brand: { $regex: search, $options: 'i' } }, { model: { $regex: search, $options: 'i' } }] } }] : []),
                    
                    { $unwind: "$variants" },
                    { $unwind: "$variants.items" },
                    
                    {
                        $group: {
                            _id: { productId: "$_id", colorSlug: "$variants.colorSlug" },
                            productBrand: { $first: "$brand" },
                            productModel: { $first: "$model" },
                            productPurchaseValue: { $first: "$purchaseValue" },
                            productValue: { $first: "$value" },
                            colorLabel: { $first: "$variants.colorLabel" },
                            items: {
                                $push: {
                                    number: "$variants.items.number",
                                    amount: "$variants.items.amount"
                                }
                            },
                            totalQuantity: { $sum: "$variants.items.amount" },
                            totalCostValue: { $sum: { $multiply: ["$purchaseValue", "$variants.items.amount"] } },
                            totalSaleValue: { $sum: { $multiply: ["$value", "$variants.items.amount"] } },
                        }
                    },
                    
                    {
                        $group: {
                            _id: "$_id.productId",
                            brand: { $first: "$productBrand" },
                            model: { $first: "$productModel" },
                            totalQuantity: { $sum: "$totalQuantity" },
                            totalCostValue: { $sum: "$totalCostValue" },
                            totalSaleValue: { $sum: "$totalSaleValue" },
                            variants: {
                                $push: {
                                    colorSlug: "$_id.colorSlug",
                                    colorLabel: "$colorLabel",
                                    items: "$items"
                                }
                            }
                        }
                    },
                    
                    {
                        $group: {
                            _id: null, 
                            grandTotalCostValue: { $sum: "$totalCostValue" },
                            grandTotalSaleValue: { $sum: "$totalSaleValue" },
                            grandTotalItemCount: { $sum: "$totalQuantity" },
                            
                            products: {
                                $push: {
                                    id: "$_id",
                                    brand: "$brand",
                                    model: "$model",
                                    totalQuantity: "$totalQuantity",
                                    totalCostValue: "$totalCostValue",
                                    totalSaleValue: "$totalSaleValue",
                                    variants: "$variants"
                                }
                            }
                        }
                    },
                    
                    {
                        $project: {
                            _id: 0,
                            summary: {
                                totalCostValue: "$grandTotalCostValue",
                                totalSaleValue: "$grandTotalSaleValue",
                                totalItemCount: "$grandTotalItemCount"
                            },
                            products: 1 
                        }
                    }
                ];
                const result = await context.MongoDB(context).collection('products_new').aggregate(pipeline).toArray();
                
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

            
            const targetUser = await MongoDB(context).collection('users').findOne({ _id: targetUserId });
            if (!targetUser) throw new Error("Usuário do relatório não encontrado.");

            const commissionRate = targetUser.commissionRate || 0;
            const userGoal = targetUser.monthlyGoal || 0;

            
            const userSalesPipeline = [
                { $match: { userId: targetUserId, createdAt: { $gte: startDate, $lte: endDate } } },
                { $group: { _id: null, totalSold: { $sum: "$finalAmount" }, salesCount: { $sum: 1 } } }
            ];
            const userResult = await MongoDB(context).collection('sales').aggregate(userSalesPipeline).toArray();
            const totalSoldByUser = userResult[0]?.totalSold || 0;

            
            const userGoalProgress = userGoal > 0 ? (totalSoldByUser / userGoal) * 100 : 0;
            let bonusPercentage = 0;
            if (userGoalProgress >= 110) {
                bonusPercentage = 1.10; 
            } else if (userGoalProgress >= 105) {
                bonusPercentage = 1.05; 
            } else if (userGoalProgress >= 100) {
                bonusPercentage = 1.0;  
            }

            
            const commissionEarned = (totalSoldByUser * commissionRate) / 100;
            const bonusEarned = bonusPercentage > 0 ? (commissionEarned * bonusPercentage) - commissionEarned : 0;
            const totalCommission = commissionEarned + bonusEarned;

            
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

        getInventorySummary: async (_, { search }, context) => {
            try {
                const pipeline = [
                    ...(search ? [{ $match: { $or: [{ brand: { $regex: search, $options: 'i' } }, { model: { $regex: search, $options: 'i' } }] } }] : []),
                    
                    { $unwind: "$variants" },
                    { $unwind: "$variants.items" },
                    
                    {
                        $group: {
                            _id: null,
                            totalQuantity: { $sum: "$variants.items.amount" },
                            totalCostValue: { $sum: { $multiply: ["$purchaseValue", "$variants.items.amount"] } },
                            totalSaleValue: { $sum: { $multiply: ["$value", "$variants.items.amount"] } },
                        }
                    },
                    
                    {
                        $project: {
                            _id: 0,
                            totalItemCount: "$totalQuantity",
                            totalCostValue: 1,
                            totalSaleValue: 1
                        }
                    }
                ];
                const result = await context.MongoDB(context).collection('products_new').aggregate(pipeline).toArray();
                
                if (result.length === 0) {
                    return {
                        totalItemCount: 0,
                        totalCostValue: 0,
                        totalSaleValue: 0
                    };
                }
                return {
                    totalItemCount: result[0].totalItemCount,
                    totalCostValue: result[0].totalCostValue,
                    totalSaleValue: result[0].totalSaleValue
                };
            } catch (error) {
                console.error("Erro ao gerar resumo do inventário:", error);
                throw new Error("Não foi possível gerar o resumo do inventário.");
            }
        },
    }
}