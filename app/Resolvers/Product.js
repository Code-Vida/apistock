"use strict";
const { MongoDB } = require("../database");
const uuid = require("uuid");
const {
  getPaginationInfo,
  getPaginationResult,
  trimObjectValues,
} = require("../Helpers");

module.exports = {
  Query: {
    async getProduct(_, { pagination, input }) {
      const { page, perPage } = getPaginationInfo(pagination);
      const product = await MongoDB()
        .collection("products_new")
        .find(trimObjectValues(input))
        .skip(perPage * (page - 1))
        .limit(perPage)
        .sort({ updatedAt: 1 })
        .toArray();

      const total = await MongoDB().collection("products_new").count(input);


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
    async searchProducts(_, { input }) {
      const filter = {};
      const limit = input.limit || 10; // Limita a 10 resultados por padrão

      // Lógica de filtro dinâmico
      if (input && input.barCode) {
        // Se um código de barras for fornecido, a busca é específica
        filter['variants.items.barCode'] = input.barCode;
      } else if (input && input.text) {
        // Se um texto for fornecido, busca por marca OU modelo (case-insensitive)
        const searchRegex = new RegExp(input.text, 'i');
        filter.$or = [
          { brand: searchRegex },
          { model: searchRegex }
        ];
      }

      // Se o input estiver vazio, retorna uma lista vazia para não sobrecarregar o banco
      if (Object.keys(filter).length === 0) {
        return [];
      }

      // Executa a busca no banco com o filtro e o limite
      const products = await MongoDB()
        .collection("products_new") // Garanta que o nome da collection está correto
        .find(filter)
        .limit(limit)
        .toArray();

      // Retorna um array simples de produtos, como a tela do PDV espera
      return products;
    }
  
  },

  Product: {
    async id({ _id }) {
      return _id;
    },
  },

  Total: {
    async totalSalesSum() {
      const totalSalesSum = await MongoDB()
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

    async totalSum() {
      const totalSum = await MongoDB()
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
    async createProduct(_, args) {
      const { input } = args;

      const insert = await MongoDB().collection('products_new').insertOne({
        ...trimObjectValues(input),
        _id: uuid.v4(),
        createdAt: new Date(),
      })

      return insert.insertedId ? true : false;
    },

    async sales(_, args) {
      const dropStock = await MongoDB()
        .collection("products")
        .findOneAndUpdate(
          {
            _id: args.input,
          },
          { $inc: { sales: 1 } },
          { returnDocument: "after" }
        );

      const salesReport = await MongoDB()
        .collection("salesReport")
        .insertOne({
          _id: uuid.v4(),
          salesDate: new Date(),
          salesAmount: 1,
          product: { ...dropStock },
        });

      return salesReport.insertedId ? { _id: salesReport?.insertedId } : null;
    },

    async updateProduct(_, args) {
      const { input } = args
      console.log(input)
      const result = await MongoDB().collection("products_new").replaceOne(
        { _id: input.id },
        input,
        { returnDocument: "after" }
      );

      return result.modifiedCount ? true : false
    },

    async acknowledgeLowStock(_, { productId }) {
      const updatedProduct = await MongoDB().collection('products_new').findByIdAndUpdate(
        { _id: productId },
        {
          // Define a data atual para o campo
          $set: { lowStockAcknowledgedAt: new Date() }
        },
        { new: true } // Retorna o documento atualizado
      );
      return updatedProduct;
    },

    processDunCode: async (_, { dunCode, quantityPerEan }, { MongoDB, client }) => {
      // Para este caso, vamos assumir que um DUN representa UM tipo de produto (um EAN)
      // em múltiplas unidades. Se um DUN representa múltiplos EANs, a lógica
      // precisaria de uma tabela de mapeamento.

      const eanCode = dunToEan(dunCode);

      const session = client.startSession();
      try {
        let updatedCount = 0;
        let notFoundEans = [];

        await session.withTransaction(async () => {
          const productsCollection = MongoDB().collection('products_new');

          // Tenta encontrar o produto pelo código EAN em qualquer uma de suas variantes
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
  },
};


function dunToEan(dunCode) {
  if (dunCode.length !== 14 || !/^\d+$/.test(dunCode)) {
    throw new Error("Código DUN-14 inválido.");
  }
  // Remove o primeiro dígito (variável logística) e o último (dígito verificador)
  const eanBase = dunCode.substring(1, 13);

  // Recalcula o dígito verificador para o EAN-13
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(eanBase[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const checksum = (10 - (sum % 10)) % 10;

  return eanBase + checksum;
}