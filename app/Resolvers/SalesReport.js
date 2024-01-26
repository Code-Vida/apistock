"use strict";
const { MongoDB } = require("../database");
const { parseISO, addDays } = require("date-fns");

module.exports = {
  Query: {
    async salesReport(_, args) {
      const { salesDate } = args.input.data;
      const date = new Date(salesDate);
      const report = await MongoDB()
        .collection("salesReport")
        .find({
          salesDate: {
            $gte: date,
            $lte: addDays(date, 1),
          },
        })
        .toArray();

      return { nodes: report };
    },

    async stockReport(_, args) {
      const { barCode } = args.input;

      const product = await MongoDB()
        .collection("products")
        .findOne({ barCode: barCode });

      return { nodes: product };
    },
  },
  Mutation: {},
};
