"use strict";
const uuid = require("uuid");
const bcrypt = require('bcryptjs');

module.exports = {
  Query: {
    async getAll(_, __, context) {
      return await context.MongoDB(context).collection("users").find({}).toArray();
    },

    getUsersByStore: async (_, __, context) => {
      const { user, MongoDB } = context;
      // Segurança: A diretiva @auth já garante que o usuário está logado.
      // Adicionamos uma verificação extra para garantir que é um admin.
      if (user.role !== 'ADMIN') {
        throw new Error("Apenas administradores podem ver a lista de usuários.");
      }

      // Busca todos os usuários que pertencem à mesma loja do admin
      const users = await MongoDB(context).collection('users').find({ storeId: user.storeId }).toArray();
      return users;
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

    createUser: async (_, { input }, context) => {
      const { user, MongoDB } = context;
      if (user.role !== 'ADMIN') {
        throw new Error("Apenas administradores podem criar novos usuários.");
      }

      const { name, email, password, role } = input;
      if (password.length < 6) throw new Error('A senha precisa ter no mínimo 6 caracteres.');

      const existingUser = await MongoDB(context).collection('users').findOne({ email });
      if (existingUser) throw new Error('Este e-mail já está em uso.');

      const hashedPassword = await bcrypt.hash(password, 12);

      const newUser = {
        _id: uuid.v4(),
        name,
        email,
        password: hashedPassword,
        role: role, // Geralmente "VENDEDOR"
        storeId: user.storeId, // Associa à loja do admin
        createdAt: new Date(),
      };

      await MongoDB(context).collection('users').insertOne(newUser);
      return newUser;
    },

    resetUserPassword: async (_, { userId, newPassword }, context) => {
      const { user, MongoDB } = context;
      if (user.role !== 'ADMIN') {
        throw new Error("Apenas administradores podem redefinir senhas.");
      }
      if (newPassword.length < 6) throw new Error('A nova senha precisa ter no mínimo 6 caracteres.');

      // Busca o usuário que terá a senha alterada
      const userToUpdate = await MongoDB(context).collection('users').findOne({ _id: userId });

      // Segurança extra: garante que o admin só pode alterar senhas de usuários da sua própria loja
      if (!userToUpdate || userToUpdate.storeId !== user.storeId) {
        throw new Error("Usuário não encontrado ou não pertence a esta loja.");
      }

      const hashedPassword = await bcrypt.hash(newPassword, 12);

      await MongoDB(context).collection('users').updateOne(
        { _id: userId },
        { $set: { password: hashedPassword } }
      );

      return true;
    },

    setManagerPin: async (_, { pin }, context) => {
      // 1. Verifica se há um usuário logado
      if (!context.user) {
        throw new Error("Autenticação necessária.");
      }

      const { MongoDB, user } = context;

      // 2. Busca o usuário no banco para garantir que ele é um admin
      const currentUser = await MongoDB(context).collection('users').findOne({ _id: user.userId });
      if (currentUser.role !== 'ADMIN') {
        throw new Error("Apenas administradores podem definir um PIN.");
      }

      // 3. Valida o formato do PIN
      if (!/^\d{4}$/.test(pin)) {
        throw new Error("O PIN deve conter exatamente 4 dígitos numéricos.");
      }

      // 4. Criptografa o PIN antes de salvar
      const hashedPin = await bcrypt.hash(pin, 10);

      // 5. Salva o PIN hasheado no documento do usuário
      await MongoDB(context).collection('users').updateOne(
        { _id: user.userId },
        { $set: { managerPin: hashedPin } }
      );

      return true;
    },

    /**
     * Verifica se o PIN fornecido corresponde a qualquer administrador da loja.
     */
    authorizeAction: async (_, { pin }, context) => {
      if (!context.user) {
        throw new Error("Ação não permitida. Nenhum usuário logado na sessão.");
      }

      const { MongoDB, user } = context;

      // 1. Encontra todos os administradores da loja do usuário atual
      const adminsInStore = await MongoDB(context).collection('users').find({
        storeId: user.storeId,
        role: 'ADMIN'
      }).toArray();

      if (adminsInStore.length === 0) {
        throw new Error("Nenhum administrador encontrado para esta loja.");
      }

      // 2. Itera sobre cada admin para verificar o PIN
      for (const admin of adminsInStore) {
        if (admin.managerPin) {
          // Compara o PIN fornecido com o PIN criptografado no banco
          const isValid = await bcrypt.compare(pin, admin.managerPin);
          if (isValid) {
            return true; // Encontrou uma correspondência, autorização concedida!
          }
        }
      }

      // 3. Se o loop terminar sem encontrar uma correspondência, a autorização falha.
      throw new Error("PIN de administrador inválido.");
    },
  },
};
