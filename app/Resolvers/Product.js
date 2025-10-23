"use strict";

const uuid = require("uuid");
const {
  getPaginationInfo,
  getPaginationResult,
  trimObjectValues,
} = require("../Helpers");

const { startOfDay, endOfDay, parseISO } = require('date-fns');

module.exports = {
  Query: {
    async getProduct(_, { pagination, input }, context) {
      const { page, perPage } = getPaginationInfo(pagination);
      const product = await context.MongoDB(context)
        .collection("products_new")
        .find(trimObjectValues(input))
        .skip(perPage * (page - 1))
        .limit(perPage)
        .sort({ updatedAt: 1 })
        .toArray();

      const total = await context.MongoDB(context).collection("products_new").count(input);


      const result = {
        pages: {
          total,
          lastPage: Math.ceil(total / perPage),
          page,
          perPage,
        },
        data: trimObjectValues(product),

      };

      return getPaginationResult(result);
    },
    async searchProducts(_, { input }, context) {
      const filter = {};
      const limit = input.limit || 10;


      if (input && input.barCode) {

        filter['variants.items.barCode'] = input.barCode;
      } else if (input && input.text) {

        const searchRegex = new RegExp(input.text, 'i');
        filter.$or = [
          { brand: searchRegex },
          { model: searchRegex }
        ];
      }


      if (Object.keys(filter).length === 0) {
        return [];
      }


      const products = await context.MongoDB(context)
        .collection("products_new")
        .find(filter)
        .limit(limit)
        .toArray();


      return products;
    },
    async getAllProducts(_, __, context) {
      const products = await context.MongoDB(context)
        .collection("products_new")
        .find({})
        .toArray();

      return products;
    },

    async storeCreditsByDate(_, { date }, context) {
      const targetDate = date ? parseISO(date) : new Date();
      const startDate = startOfDay(targetDate);
      const endDate = endOfDay(targetDate);

      const result = await context.MongoDB(context).collection('return_credits').find({
        createdAt: {
          $gte: startDate,
          $lte: endDate
        }
      }).toArray();
      return result;
    },

    async storeCreditByCode(_, { code }, context) {
      const result = await context.MongoDB(context).collection('return_credits').findOne({ code });
      return result;
    }
  },

  StoreCredit: {
    async isActive({ balance,  isActive }) {
      if(isActive) return true;
      
      return balance > 0;
    },
  },

  Product: {
    async id({ _id }) {
      return _id;
    },
  },

  Total: {
    async totalSalesSum(_, __, context) {
      const totalSalesSum = await context.MongoDB(context)
        .collection("products")
        .aggregate([
          {
            $group: {
              _id: null,
              totalValue: { $sum: { $multiply: ["$value", "$sales"] } },
            },
          },
        ])
        .toArray();
      return totalSalesSum[0].totalValue;
    },

    async totalSum(_, __, context) {
      const totalSum = await context.MongoDB(context)
        .collection("products")
        .aggregate([
          {
            $group: {
              _id: null,
              totalSum: { $sum: "$purchaseValue" },
            },
          },
        ])
        .toArray();
      return totalSum[0].totalSum;
    },
  },

  Mutation: {
    async createProduct(_, args, context) {
      const { input } = args;

      const insert = await context.MongoDB(context).collection('products_new').insertOne({
        ...trimObjectValues(input),
        _id: uuid.v4(),
        createdAt: new Date(),
      })

      return insert.insertedId ? true : false;
    },

    async sales(_, args, context) {
      const dropStock = await context.MongoDB(context)
        .collection("products")
        .findOneAndUpdate(
          {
            _id: args.input,
          },
          { $inc: { sales: 1 } },
          { returnDocument: "after" }
        );

      const salesReport = await context.MongoDB(context)
        .collection("salesReport")
        .insertOne({
          _id: uuid.v4(),
          salesDate: new Date(),
          salesAmount: 1,
          product: { ...dropStock },
        });

      return salesReport.insertedId ? { _id: salesReport?.insertedId } : null;
    },

    async updateProduct(_, args, context) {
      const { input } = args
      const result = await context.MongoDB(context).collection("products_new").replaceOne(
        { _id: input.id },
        input,
        { returnDocument: "after" }
      );
      console.log(result);
      return result.modifiedCount ? true : false
    },

    async acknowledgeLowStock(_, { productId }, context) {
      const updatedProduct = await context.MongoDB(context).collection('products_new').findByIdAndUpdate(
        { _id: productId },
        {

          $set: { lowStockAcknowledgedAt: new Date() }
        },
        { new: true }
      );
      return updatedProduct;
    },

    processDunCode: async (_, { dunCode, quantityPerEan }, context) => {



      const { client } = context;
      const eanCode = dunToEan(dunCode);

      const session = client.startSession();
      try {
        let updatedCount = 0;
        let notFoundEans = [];

        await session.withTransaction(async () => {
          const productsCollection = context.MongoDB(context).collection('products_new');


          const updateResult = await productsCollection.updateOne(
            { "variants.items.barCode": eanCode },
            { $inc: { "variants.$[].items.$[item].amount": quantityPerEan } },
            {
              arrayFilters: [{ "item.barCode": eanCode }],
              session
            }
          );

          if (updateResult.modifiedCount > 0) {
            updatedCount = updateResult.modifiedCount;
          } else {
            notFoundEans.push(eanCode);
          }
        });

        return {
          updatedProductsCount: updatedCount,
          notFoundEans: notFoundEans,
        };

      } catch (error) {
        console.error("Erro ao processar código DUN:", error);
        throw new Error(error.message || "Não foi possível processar a entrada de estoque.");
      } finally {
        await session.endSession();
      }
    },

    createReturn: async (_, { input }, context) => {
      const { client } = context;
      const session = client.startSession();

      try {
        let returnResult = false;
        await session.withTransaction(async () => {

          const returnDocument = {
            _id: uuid.v4(),
            originalSaleId: input.originalSaleId,
            items: input.items,
            totalRefundAmount: input.totalRefundAmount,
            refundMethod: input.refundMethod,
            reason: input.reason,
            createdAt: new Date(),
          };
          await context.MongoDB(context).collection('returns').insertOne(returnDocument, { session });


          const stockUpdateOperations = input.items.map(item => ({
            updateOne: {
              filter: { _id: item.productId },
              update: { $inc: { "variants.$[variant].items.$[item].amount": item.quantity } },
              arrayFilters: [
                { "variant.colorSlug": item.colorSlug },
                { "item.number": item.number }
              ]
            }
          }));

          if (stockUpdateOperations.length > 0) {
            await context.MongoDB(context).collection('products_new').bulkWrite(stockUpdateOperations, { session });
          }


          if (input.refundMethod === 'Dinheiro') {
            const activeSession = await context.MongoDB(context).collection('cash').findOne({ status: 'OPEN' }, { session });
            if (!activeSession) {

              throw new Error("Nenhum caixa aberto para registrar a saída do reembolso.");
            }
            const withdrawalMovement = {
              _id: uuid.v4(),
              sessionId: activeSession._id,
              type: 'WITHDRAWAL',
              amount: input.totalRefundAmount,
              description: `Devolução da Venda #${input.originalSaleId.substring(0, 8)}`,
              createdAt: new Date(),
            };
            await context.MongoDB(context).collection('cash_movements').insertOne(withdrawalMovement, { session });
          }

          returnResult = true;
        });

        return returnResult;

      } catch (error) {
        console.error("Erro ao processar devolução:", error);
        throw new Error(error.message || "Não foi possível registrar a devolução.");
      } finally {
        await session.endSession();
      }
    },

    createStoreCredit: async (_, { input }, context) => {

      const { client } = context;
      const session = client.startSession();

      await context.MongoDB(context).collection('return_credits').insertOne({ ...input, _id: uuid.v4(), createdAt: new Date() }, { session });
      return
    },

    updateStoreCredit: async (_, { code, balance, isActive }, context) => {

      const updatedCredit = await context.MongoDB(context).collection('return_credits').findOneAndUpdate(
        { code },
        { $set: { balance, isActive } },
        { returnDocument: 'after' }
      );
      return updatedCredit.value;
    },
  },
};


function dunToEan(dunCode) {
  if (dunCode.length !== 14 || !/^\d+$/.test(dunCode)) {
    throw new Error("Código DUN-14 inválido.");
  }

  const eanBase = dunCode.substring(1, 13);


  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(eanBase[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const checksum = (10 - (sum % 10)) % 10;

  return eanBase + checksum;
}