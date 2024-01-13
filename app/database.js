const { MongoClient } = require("mongodb");

let database = null;
let client = null;

async function connect() {
  //const uri = 'mongodb://mongo:digh0s1LbYImdbYe7TDd@containers-us-west-136.railway.app:7582'
  const uri =
    "mongodb://mongo:5BC3d255cdbCEE3Ge4c5a1e63hD3d5fE@roundhouse.proxy.rlwy.net:29675";
  //const uri = 'mongodb://localhost:27017'
  const dbName = "apistock";
  client = new MongoClient(uri);

  await client.connect((err, db) => {
    if (err) throw err;
  });
  database = client.db(dbName);
}

function MongoDB() {
  if (!database) connect();
  return database;
}

MongoDB();

module.exports = { MongoDB, client };
