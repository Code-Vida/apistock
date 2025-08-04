const express = require("express");
const { ApolloServer } = require("apollo-server-express");
const { join } = require("path");
const { loadFilesSync } = require("@graphql-tools/load-files");
require("dotenv").config();

// MUDANÇA 1: Importe a 'mongoInstance' do seu arquivo de conexão
const { mongoInstance, MongoDB } = require("./app/database"); // Ajuste o caminho se necessário

async function startApolloServer() {
  // MUDANÇA 2: Conecte-se ao MongoDB logo no início.
  // O 'await' garante que o resto do código só executa após a conexão ser bem-sucedida.
  await mongoInstance.connect();

  const app = express();
  const typeDefs = loadFilesSync(join(__dirname, "app", "Schemas"));
  const resolvers = require("./app/Resolvers/index");

  const server = new ApolloServer({
    typeDefs,
    resolvers,
    // MUDANÇA 3 (Opcional, mas recomendado): Passe o client para o contexto.
    // Isso permite que seus resolvers acessem o client para transações sem
    // precisar importá-lo em todos os arquivos.
    context: () => {
      return {
        client: mongoInstance.getClient(),
        // Você também pode passar sua função helper se quiser
        MongoDB: MongoDB,
      };
    },
  });

  app.get("/ping", (req, res) => {
    res.send("Oi!!");
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