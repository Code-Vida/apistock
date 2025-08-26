const express = require("express");
const { ApolloServer } = require("apollo-server-express");
const { join } = require("path");
const { loadFilesSync } = require("@graphql-tools/load-files");
const jwt = require('jsonwebtoken');
require("dotenv").config();

// NOVOS IMPORTS
const { makeExecutableSchema } = require('@graphql-tools/schema');
const { mapSchema, getDirective, MapperKind } = require('@graphql-tools/utils');
const { GraphQLError, defaultFieldResolver } = require('graphql');

// MUDANÇA 1: Importe a 'mongoInstance' do seu arquivo de conexão
const { mongoInstance, MongoDB } = require("./app/database"); // Ajuste o caminho se necessário


// eslint-disable-next-line no-undef
const JWT_SECRET = process.env.JWT_SECRET || 'seu-segredo-super-secreto';

// Função para extrair o usuário do token (sem alteração)
const getUserFromToken = (token) => {
  if (token) {
    try {
      return jwt.verify(token, JWT_SECRET);
    } catch (e) {
      console.log("Token inválido:", e);
      return null;
    }
  }
  return null;
};

// NOVA FUNÇÃO: Lógica da nossa diretiva @auth
function authDirectiveTransformer(schema, directiveName) {
  return mapSchema(schema, {
    // Executa uma vez para cada campo de objeto (query, mutação, etc.) no schema
    [MapperKind.OBJECT_FIELD]: (fieldConfig) => {
      const authDirective = getDirective(schema, fieldConfig, directiveName)?.[0];

      if (authDirective) {
        const { resolve = defaultFieldResolver } = fieldConfig;

        // Substitui o resolver original por um novo que faz a verificação
        fieldConfig.resolve = function (source, args, context, info) {
          if (!context.user) {
            throw new GraphQLError('Não autorizado. Você precisa estar logado para realizar esta ação.', {
              extensions: { code: 'UNAUTHENTICATED' },
            });
          }

          // Se o usuário estiver autenticado, chama o resolver original
          return resolve(source, args, context, info);
        }
        return fieldConfig;
      }
    }
  });
}


async function startApolloServer() {
  await mongoInstance.connect();

  const app = express();

  // Carrega os schemas e resolvers como antes
  // eslint-disable-next-line no-undef
  const loadedTypeDefs = loadFilesSync(join(__dirname, "app", "Schemas"));
  const resolvers = require("./app/Resolvers/index");

  // MUDANÇA: Adiciona a definição da diretiva ao schema
  const typeDefs = [
    ...loadedTypeDefs,
    'directive @auth on FIELD_DEFINITION'
  ];

  // MUDANÇA: Cria um schema executável e aplica a transformação da diretiva
  let schema = makeExecutableSchema({ typeDefs, resolvers });
  schema = authDirectiveTransformer(schema, 'auth');

  const server = new ApolloServer({
    // MUDANÇA: Passa o schema transformado em vez de typeDefs/resolvers separados
    schema,
    context: ({ req }) => {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.replace('Bearer ', '');
      const user = getUserFromToken(token);
      return {
        user,
        client: mongoInstance.getClient(),
        MongoDB: MongoDB,
      };
    },
  });

  await server.start();

  server.applyMiddleware({ app });
  // eslint-disable-next-line no-undef
  app.listen({ port: process.env.PORT || 4000 }, () =>
    console.log(
      // eslint-disable-next-line no-undef
      `🚀 Server ready at http://localhost:${process.env.PORT || 4000}${server.graphqlPath}`
    )
  );
}

startApolloServer();
