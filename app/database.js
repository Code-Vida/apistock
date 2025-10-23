/* eslint-disable no-undef */
const { MongoClient } = require("mongodb");


const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = process.env.MONGO_DATABASE;

/**
 * Classe Singleton para gerenciar a conexão com o MongoDB.
 */
class MongoService {
  constructor() {
    this.client = new MongoClient(MONGO_URI);
    this.db = null;
  }

  async connect() {
    if (this.db) return;
    try {
      await this.client.connect();
      this.db = this.client.db(DB_NAME);
      console.log("✅ Conectado ao MongoDB com sucesso.");
      console.log(`🌐 Banco de dados: ${DB_NAME}`);
      console.log(`🚀 URI: ${MONGO_URI}`);
    } catch (error) {
      console.error("❌ Falha ao conectar com o MongoDB:", error);
      process.exit(1);
    }
  }

  getDb() {
    if (!this.db) throw new Error("A conexão com o MongoDB não foi inicializada.");
    return this.db;
  }

  getClient() {
    return this.client;
  }
}

const mongoInstance = new MongoService();

/**
 * Função helper que agora aceita o 'context' do resolver para aplicar
 * o filtro de 'storeId' automaticamente em todas as operações.
 */
function MongoDB(context) {
  const database = mongoInstance.getDb();


  const storeId = context?.user?.storeId;

  return {
    collection: (name) => {
      const collection = database.collection(name);
      const defaultCollation = { locale: 'pt', strength: 2 };


      const publicCollections = ['users', 'stores'];
      const isProtectedCollection = !publicCollections.includes(name);



      if (isProtectedCollection && !storeId) {
        throw new Error(`Acesso não autorizado à collection '${name}'. É necessário estar autenticado com uma loja válida.`);
      }


      const applyStoreIdFilter = isProtectedCollection && storeId;

      return {

        find: (filter = {}, options = {}) => {
          const secureFilter = applyStoreIdFilter ? { ...filter, storeId } : filter;
          return collection.find(secureFilter, { ...options, collation: defaultCollation });
        },
        findOne: (filter = {}, options = {}) => {
          const secureFilter = applyStoreIdFilter ? { ...filter, storeId } : filter;
          return collection.findOne(secureFilter, { ...options, collation: defaultCollation });
        },
        count: (filter = {}, options = {}) => {
          const secureFilter = applyStoreIdFilter ? { ...filter, storeId } : filter;
          return collection.countDocuments(secureFilter, { ...options, collation: defaultCollation });
        },
        aggregate: (pipeline = [], options = {}) => {
          const securePipeline = [...pipeline];
          if (applyStoreIdFilter) {
            securePipeline.unshift({ $match: { storeId } });
          }
          return collection.aggregate(securePipeline, { ...options, collation: defaultCollation });
        },


        insertOne: (doc, options) => {
          const secureDoc = applyStoreIdFilter ? { ...doc, storeId } : doc;
          return collection.insertOne(secureDoc, options);
        },
        updateOne: (filter, update, options) => {
          const secureFilter = applyStoreIdFilter ? { ...filter, storeId } : filter;
          return collection.updateOne(secureFilter, update, options);
        },
        findOneAndUpdate: (filter, update, options) => {
          const secureFilter = applyStoreIdFilter ? { ...filter, storeId } : filter;
          return collection.findOneAndUpdate(secureFilter, update, options);
        },
        replaceOne: (filter, replacement, options) => {
          const secureFilter = applyStoreIdFilter ? { ...filter, storeId } : filter;
          const update = applyStoreIdFilter ? { ...replacement, storeId } : replacement;
          return collection.replaceOne(secureFilter, update, options)
        },
        bulkWrite: (operations, options) => {
          if (applyStoreIdFilter) {
            operations.forEach(op => {
              const opType = Object.keys(op)[0];
              op[opType].filter = { ...op[opType].filter, storeId };
            });
          }
          return collection.bulkWrite(operations, options);
        },
        deleteOne: (filter, options) => {
          const secureFilter = applyStoreIdFilter ? { ...filter, storeId } : filter;
          return collection.deleteOne(secureFilter, options);
        },
        findByIdAndUpdate: (id, update, options) => {
          const secureFilter = applyStoreIdFilter ? { _id: id, storeId } : { _id: id };
          return collection.findOneAndUpdate(secureFilter, update, options);
        },
      };
    },
    getClient: () => mongoInstance.getClient(),
  };
}

module.exports = { mongoInstance, MongoDB };
