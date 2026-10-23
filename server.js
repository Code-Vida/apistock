/* eslint-disable no-undef */
const express = require("express");
const { ApolloServer } = require("apollo-server-express");
const { join } = require("path");
const { loadFilesSync } = require("@graphql-tools/load-files");
const jwt = require('jsonwebtoken');
require("dotenv").config();


const { makeExecutableSchema } = require('@graphql-tools/schema');
const { mapSchema, getDirective, MapperKind } = require('@graphql-tools/utils');
const { GraphQLError, defaultFieldResolver } = require('graphql');


const { mongoInstance, MongoDB } = require("./app/database");



const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET não definido. Configure a variável de ambiente.");
}


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


function authDirectiveTransformer(schema, directiveName) {
  return mapSchema(schema, {

    [MapperKind.OBJECT_FIELD]: (fieldConfig) => {
      const authDirective = getDirective(schema, fieldConfig, directiveName)?.[0];

      if (authDirective) {
        const { resolve = defaultFieldResolver } = fieldConfig;


        fieldConfig.resolve = function (source, args, context, info) {
          if (!context.user) {
            throw new GraphQLError('Não autorizado. Você precisa estar logado para realizar esta ação.', {
              extensions: { code: 'UNAUTHENTICATED' },
            });
          }


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



  const loadedTypeDefs = loadFilesSync(join(__dirname, "app", "Schemas"));
  const resolvers = require("./app/Resolvers/index");


  const typeDefs = [
    ...loadedTypeDefs,
    'directive @auth on FIELD_DEFINITION'
  ];


  let schema = makeExecutableSchema({ typeDefs, resolvers });
  schema = authDirectiveTransformer(schema, 'auth');

  const server = new ApolloServer({

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

  app.listen({ port: process.env.PORT || 4000 }, () =>
    console.log(

      `🚀 Server ready at http://localhost:${process.env.PORT || 4000}${server.graphqlPath}`
    )
  );
}

startApolloServer();
