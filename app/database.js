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
        insertOne: (doc) => collection.insertOne(doc),
        updateOne: (filter, update, options) => collection.updateOne(filter, update, options),
        deleteOne: (filter) => collection.deleteOne(filter),
        findOneAndUpdate: (filter, update, options) => collection.findOneAndUpdate(filter, update, options),

        // Acesso direto ao collection bruto, se precisar
        raw: () => collection,
      };
    },
  };
}

MongoDB();




module.exports = { MongoDB, client };
