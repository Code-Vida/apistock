"use strict";
const { MongoDB } = require("../database");
const uuid = require("uuid");

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

    async createUser(_, args) {
      const { firstName, lastName } = args.input;
      const insertUser = await MongoDB().collection("users").insertOne({
        id: uuid.v4(),
        firstName: firstName,
        lastName: lastName,
      });

      return { id: insertUser.insertedId };
    },
  },
};
