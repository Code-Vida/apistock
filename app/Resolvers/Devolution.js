
module.exports = {
  Mutation: {
      async devolution(_, args, context) {
      const devolution = await context.MongoDB(context)
        .collection("products")
        .findOneAndUpdate(
          {
            _id: args.input,
          },
          { $inc: { amount: 1 } }
        );
      return devolution !== null;
    },
  },
};
