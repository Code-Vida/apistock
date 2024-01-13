const express = require("express");
const { ApolloServer } = require("apollo-server-express");
const { join } = require("path");
const { loadFilesSync } = require("@graphql-tools/load-files");

async function startApolloServer() {
  const app = express();
  const typeDefs = loadFilesSync(join(__dirname, "app", "Schemas"));
  const resolvers = require("./app/Resolvers/index");
  const server = new ApolloServer({
    typeDefs,
    resolvers,
  });

  app.get("/ping", (req, res) => {
    res.send("Oi!!");
  });

  await server.start();

  server.applyMiddleware({ app });
  app.listen({ port: process.env.PORT || 4000 }, () =>
    console.log(
      `🚀 Server ready at http://localhost:${process.env.PORT}${server.graphqlPath}`
    )
  );
}

startApolloServer();
