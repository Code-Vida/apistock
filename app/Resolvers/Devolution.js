const { MongoDB } = require("../database");

module.exports = {
  Query: {
    async getAll() {
      return await MongoDB().collection("users").find({}).toArray();
    },
  },
  Mutation: {
    // async login(_, args, { req }) {
    //   const { email, password } = args.input;

    //   const user = await MongoDB()
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

    async devolution(_, args) {
      const devolution = await MongoDB()
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
