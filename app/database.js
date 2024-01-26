const { MongoClient } = require("mongodb");

let database = null;
let client = null;

async function connect() {
  const uri = process.env.MONGO_URI;
  const dbName = process.env.MONGO_DATABASE;

  client = new MongoClient(uri);

  await client.connect();
  database = client.db(dbName);
}

function MongoDB() {
  if (!database) connect();
  return database;
}

MongoDB();

module.exports = { MongoDB, client };
