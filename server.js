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
  app.listen({ port: 4000 }, () =>
    console.log(
      `🚀 Server ready ataaaa http://localhost:4000${server.graphqlPath}`
    )
  );
}

startApolloServer();
