
module.exports = {
  Query: {
    async getAll(_, __, context) {
      return await context.MongoDB(context).collection("users").find({}).toArray();
    },
  },
  Mutation: {
    // async login(_, args, { req }) {
    //   const { email, password } = args.input;

    //   const user = await context.MongoDB(context)
    //     .collection("users")
    //     .findOne({ email: email });
    //   if (!user) {
    //     throw new Error("Usuário não cadastrado");
    //   }

    //   if (user.password !== password) {
    //     throw new Error("Senha inválida");
    //   }
    //   console.log(user);

    //   return user;
    // },

    async devolution(_, args, context) {
      const devolution = await context.MongoDB(context)
        .collection("products")
        .findOneAndUpdate(
          {
            _id: args.input,
          },
          { $inc: { amount: 1 } }
          //   { returnDocument: "after" }
        );
      return devolution !== null;
    },
  },
};
