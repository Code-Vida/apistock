"use strict";
const { startOfDay, endOfDay, parseISO } = require('date-fns'); 

module.exports = {
    Query: {
        dashboardSummary: async (_, { date }, context) => {
            
            const targetDate = date ? parseISO(date) : new Date();
            const startDate = startOfDay(targetDate);
            const endDate = endOfDay(targetDate);            
            const summaryPipeline = [
                {
                    
                    $match: {
                        createdAt: { $gte: startDate, $lte: endDate }
                    }
                },
                {
                    
                    $group: {
                        _id: null, 
                        totalSalesToday: { $sum: "$finalAmount" }, 
                        salesCountToday: { $sum: 1 }, 
                        itemsSoldToday: { $sum: { $sum: "$items.quantity" } } 
                    }
                }
            ];

            const result = await context.MongoDB(context).collection("sales").aggregate(summaryPipeline).toArray();

            
            if (result.length === 0) {
                return { totalSalesToday: 0, itemsSoldToday: 0, salesCountToday: 0 };
            }

            return result[0];
        },

        
        lowStockProducts: async (_, { limit = 5, threshold = 10 }, context) => {
            
            const lowStockPipeline = [                
                { $unwind: "$variants" },                
                { $unwind: "$variants.items" },                
                {
                    $group: {
                        _id: "$_id",
                        brand: { $first: "$brand" }, 
                        model: { $first: "$model" },
                        totalStock: { $sum: "$variants.items.amount" } 
                    }
                },                
                {
                    $match: {
                        totalStock: { $lte: threshold },
                        lowStockAcknowledgedAt: { $eq: null }
                    }
                },                
                { $sort: { totalStock: 1 } },                
                { $limit: limit },                
                {
                    $project: {
                        _id: 0,
                        id: "$_id",
                        brand: 1,
                        model: 1,
                        totalStock: 1
                    }
                }
            ];

            const result = await context.MongoDB(context).collection("products_new").aggregate(lowStockPipeline).toArray();
            return result;
        }
    },
};
