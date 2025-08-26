"use strict";
const { addDays } = require("date-fns");

module.exports = {
  Query: {
    async salesReport(_, args, context) {
      const { salesDate } = args.input.data;
      const date = new Date(salesDate);
      const report = await context.MongoDB(context)
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

    async stockReport(_, args, context) {
      const { barCode } = args.input;

      const product = await context.MongoDB(context)
        .collection("products")
        .findOne({ barCode: barCode });

      return { nodes: product };
    },
  },
  Mutation: {},
};
