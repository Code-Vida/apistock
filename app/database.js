const { MongoClient } = require("mongodb");

let client;
let database;

async function connect() {
  const uri = process.env.MONGO_URI;
  const dbName = process.env.MONGO_DATABASE;

  client = new MongoClient(uri);
  await client.connect();
  database = client.db(dbName);
}

function MongoDB() {
  if (!database) connect();

  return {
    collection: (name) => {
      const collection = database.collection(name);

      const defaultCollation = { locale: 'pt', strength: 2 };

      return {
        // Métodos de leitura com collation automático
        find: (filter = {}, options = {}) => {
          return collection.find(filter, {
            ...options,
            collation: defaultCollation,
          });
        },

        findOne: (filter = {}, options = {}) => {
          return collection.findOne(filter, {
            ...options,
            collation: defaultCollation,
          });
        },

        count: (filter = {}, options = {}) => {
          return collection.countDocuments(filter, {
            ...options,
            collation: defaultCollation,
          });
        },

        aggregate: (pipeline = [], options = {}) => {
          return collection.aggregate(pipeline, {
            ...options,
            collation: defaultCollation,
          });
        },

        // Métodos de escrita (sem collation)
        insertOne: (doc, options) => collection.insertOne(doc, options),
        updateOne: (filter, update, options) => collection.updateOne(filter, update, options),
        replaceOne: (filter, replacement, options) => collection.replaceOne(filter, replacement, options),
        deleteOne: (filter, options) => collection.deleteOne(filter, options),
        findOneAndUpdate: (filter, update, options) => collection.findOneAndUpdate(filter, update, options),

        findByIdAndUpdate: (id, update, options) => collection.findOneAndUpdate(id, update, options),
        bulkWrite: (operations, options) => collection.bulkWrite(operations, options),

        // Acesso direto ao collection bruto, se precisar
        raw: () => collection,
      };
    },

    getClient: () => {
      // Este método simplesmente retorna a variável 'client' que já existe no escopo deste arquivo.
      return client;
    }
  };
}

MongoDB();




module.exports = { MongoDB, client };
