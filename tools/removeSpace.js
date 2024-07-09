const { MongoClient } = require("mongodb");

async function updateDatabase() {
  const uri = process.env.MONGO_URI;
  const client = new MongoClient(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  try {
    await client.connect();
    const database = client.db("apistock");
    const collection = database.collection("products");

    // Buscar todos os documentos
    const documents = await collection.find({}).toArray();

    // Verificar e atualizar os documentos
    for (const doc of documents) {
      const updatedFields = {};
      let needsUpdate = false;

      ["barCode", "brand", "model", "color"].forEach((field) => {
        if (doc[field] && doc[field].endsWith(" ")) {
          updatedFields[field] = doc[field].trim();
          needsUpdate = true;
        }
      });

      if (needsUpdate) {
        await collection.updateOne({ _id: doc._id }, { $set: updatedFields });
      }
    }

    console.log("Atualização concluída com sucesso.");
  } catch (err) {
    console.error(err);
  } finally {
    await client.close();
  }
}

updateDatabase();
