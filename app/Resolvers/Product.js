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
        .collection("products")
        .find(trimObjectValues(input))
        .skip(perPage * (page - 1))
        .limit(perPage)
        .sort({ updatedAt: 1 })
        .toArray();

      const total = await MongoDB().collection("products").count(input);

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

      const result = {
        pages: {
          total,
          lastPage: Math.ceil(total / perPage),
          page,
          perPage,
        },
        data: trimObjectValues(product),
        total: {
          totalSum: totalSum[0].totalSum,
          totalSalesSum: totalSalesSum[0].totalValue,
        },
      };

      return getPaginationResult(result);
    },
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
      const {
        barCode,
        amount,
        brand,
        model,
        color,
        number,
        purchaseDate,
        purchaseValue,
        value,
        id,
      } = args.input;

      const input = {
        barCode: barCode,
        amount: amount,
        brand: brand,
        model: model,
        color: color,
        number: number,
        purchaseDate: purchaseDate,
        purchaseValue: purchaseValue,
        value: value,
        updatedAt: new Date(),
      };

      if (id) {
        const update = await MongoDB()
          .collection("products")
          .updateOne(
            {
              _id: id,
            },
            {
              $set: { ...trimObjectValues(input), updatedAt: new Date() },
            },
            { returnDocument: "after" }
          );
        return update.modifiedCount > 0 ? { _id: id } : null;
      }
      const insert = await MongoDB()
        .collection("products")
        .insertOne({
          ...trimObjectValues(input),
          _id: uuid.v4(),
          createdAt: new Date(),
        });

      return insert.insertedId ? { _id: insert?.insertedId } : null;
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
  },
};
