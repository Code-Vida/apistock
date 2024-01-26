"use strict";
const { MongoDB } = require("../database");
const uuid = require("uuid");

module.exports = {
  Query: {
    async getProduct(_, args) {
      const { barCode } = args.input;
      const product = await MongoDB()
        .collection("products")
        .findOne({ barCode: barCode });

      return { nodes: product };
    },
  },

  Product: {
    async id({ _id }) {
      return _id;
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

      if (id) {
        const update = await MongoDB()
          .collection("products")
          .updateOne(
            {
              _id: id,
            },
            {
              $set: {
                barCode: barCode,
                amount: amount,
                brand: brand,
                model: model,
                color: color,
                number: number,
                purchaseDate: purchaseDate,
                purchaseValue: purchaseValue,
                value: value,
              },
            },
            { returnDocument: "after" }
          );
        return update.modifiedCount > 0 ? { _id: id } : null;
      }
      const insert = await MongoDB().collection("products").insertOne({
        _id: uuid.v4(),
        barCode: barCode,
        amount: amount,
        brand: brand,
        model: model,
        color: color,
        number: number,
        purchaseDate: purchaseDate,
        purchaseValue: purchaseValue,
        value: value,
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
          { $inc: { amount: -1 } },
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
