const uuid = require("uuid");

module.exports = {
    Query: {
        getSuppliers: async (_, { searchText }, context) => {
            const filter = {};
            if (searchText) {
                const searchRegex = new RegExp(searchText, 'i');
                filter.name = searchRegex;
            }
            return await context.MongoDB(context).collection('suppliers').find(filter).sort({ name: 1 }).toArray();
        },

        getSupplierById: async (_, { id }, context) => {
            return await context.MongoDB(context).collection('suppliers').findOne({ _id: id });
        },

        getPurchaseOrders: async (_, { status }, context) => {
            const filter = {};
            if (status) {
                filter.status = status;
            }

            
            const pipeline = [
                { $match: filter },
                { $sort: { createdAt: -1 } },
                {
                    $lookup: {
                        from: "suppliers",
                        localField: "supplierId",
                        foreignField: "_id",
                        as: "supplierInfo"
                    }
                },
                { $unwind: "$supplierInfo" },
                { $addFields: { supplier: "$supplierInfo" } },
                { $project: { supplierInfo: 0 } }
            ];

            return await context.MongoDB(context).collection('purchase_orders').aggregate(pipeline).toArray();
        },

        getPurchaseOrderById: async (_, { id }, context) => {
            try {
                const pipeline = [
                    
                    { $match: { _id: id } },

                    
                    {
                        $lookup: {
                            from: "suppliers",
                            localField: "supplierId",
                            foreignField: "_id",
                            as: "supplierInfo"
                        }
                    },

                    
                    { $unwind: "$items" },

                    
                    {
                        $lookup: {
                            from: "products_new", 
                            localField: "items.productId",
                            foreignField: "_id",
                            as: "items.productInfo"
                        }
                    },

                    
                    {
                        $group: {
                            _id: "$_id",
                            createdAt: { $first: "$createdAt" },
                            status: { $first: "$status" },
                            totalCost: { $first: "$totalCost" },
                            supplier: { $first: { $arrayElemAt: ["$supplierInfo", 0] } }, 
                            items: {
                                $push: { 
                                    quantity: "$items.quantity",
                                    costPrice: "$items.costPrice",
                                    product: { $arrayElemAt: ["$items.productInfo", 0] },
                                    variantInfo: "$items.variantInfo"
                                }
                            }
                        }
                    }
                ];

                const result = await context.MongoDB(context).collection('purchase_orders').aggregate(pipeline).toArray();

                
                return result[0] || null;

            } catch (error) {
                console.error("Erro ao buscar detalhes da ordem de compra:", error);
                throw new Error("Não foi possível carregar os detalhes da ordem de compra.");
            }
        },
    },
    Mutation: {
        createSupplier: async (_, { input }, context) => {
            const newSupplier = {
                _id: uuid.v4(),
                ...input,
                createdAt: new Date(),
            };
            await context.MongoDB(context).collection('suppliers').insertOne(newSupplier);
            return newSupplier;
        },

        updateSupplier: async (_, { id, input }, context) => {
            const result = await context.MongoDB(context).collection('suppliers').findOneAndUpdate(
                { _id: id },
                { $set: input },
                { returnDocument: 'after' }
            );
            return result;
        },

        deleteSupplier: async (_, { id }, context) => {
            const result = await context.MongoDB(context).collection('suppliers').deleteOne({ _id: id });
            return result.deletedCount === 1;
        },

        createPurchaseOrder: async (_, { input }, context) => {
            const { supplierId, items } = input;

            
            const totalCost = items.reduce((sum, item) => sum + (item.costPrice * item.quantity), 0);

            const newOrder = {
                _id: uuid.v4(),
                supplierId,
                status: "PENDENTE",
                createdAt: new Date(),
                receivedAt: null,
                items: items.map(item => ({
                    productId: item.productId,
                    variantInfo: { colorSlug: item.colorSlug, number: item.number },
                    quantity: item.quantity,
                    costPrice: item.costPrice
                })),
                totalCost,
            };

            await context.MongoDB(context).collection('purchase_orders').insertOne(newOrder);
            
            
            return newOrder;
        },

        receivePurchaseOrder: async (_, { id }, context) => {

            const { client } = context;
            const session = client.startSession();
            try {
                let result = false;
                await session.withTransaction(async () => {
                    const purchaseOrder = await context.MongoDB(context).collection('purchase_orders').findOne({ _id: id, status: "PENDENTE" }, { session });

                    if (!purchaseOrder) {
                        throw new Error("Ordem de compra não encontrada ou já recebida.");
                    }

                    
                    const stockUpdateOperations = purchaseOrder.items.map(item => ({
                        updateOne: {
                            filter: { _id: item.productId },
                            update: { $inc: { "variants.$[variant].items.$[item].amount": item.quantity } },
                            arrayFilters: [
                                { "variant.colorSlug": item.variantInfo.colorSlug },
                                { "item.number": item.variantInfo.number }
                            ]
                        }
                    }));

                    if (stockUpdateOperations.length > 0) {
                        await context.MongoDB(context).collection('products_new').bulkWrite(stockUpdateOperations, { session });
                    }

                    
                    await context.MongoDB(context).collection('purchase_orders').updateOne(
                        { _id: id },
                        { $set: { status: "RECEBIDO", receivedAt: new Date() } },
                        { session }
                    );

                    result = true;
                });
                return result;
            } catch (error) {
                console.error("Erro ao receber ordem de compra:", error);
                throw new Error(error.message || "Não foi possível dar entrada no estoque.");
            } finally {
                await session.endSession();
            }
        },
    }
}