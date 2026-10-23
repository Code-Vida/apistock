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
const FiscalService = require("./app/services/FiscalService");



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


// Limite simples por IP, em memória. Freia força bruta (login, PIN) e abuso.
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX) || 300;
const requestCounts = new Map();

function rateLimit(req, res, next) {
  const now = Date.now();
  const entry = requestCounts.get(req.ip);
  if (!entry || entry.resetAt <= now) {
    requestCounts.set(req.ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return next();
  }
  entry.count += 1;
  if (entry.count > RATE_LIMIT_MAX) {
    return res.status(429).json({ errors: [{ message: "Muitas requisições. Tente novamente em instantes." }] });
  }
  return next();
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of requestCounts) {
    if (entry.resetAt <= now) requestCounts.delete(ip);
  }
}, RATE_LIMIT_WINDOW_MS).unref();

// CORS_ORIGINS: lista separada por vírgula (ex.: https://app.fluxy.com.br).
// Sem a variável, mantém o comportamento anterior (qualquer origem).
const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map((origin) => origin.trim())
  : true;

async function startApolloServer() {
  await mongoInstance.connect();
  FiscalService.retomarConsultasPendentes(mongoInstance.getDb(), MongoDB)
    .catch((err) => console.error("[FiscalService] Falha ao retomar consultas:", err.message));

  const app = express();
  // Railway fica atrás de proxy: necessário para req.ip ser o IP real do cliente.
  app.set("trust proxy", 1);
  app.use(rateLimit);



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

  server.applyMiddleware({ app, cors: { origin: corsOrigins } });

  app.listen({ port: process.env.PORT || 4000 }, () =>
    console.log(

      `🚀 Server ready at http://localhost:${process.env.PORT || 4000}${server.graphqlPath}`
    )
  );
}

startApolloServer();
