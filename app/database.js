const { MongoClient } = require("mongodb");

// --- CONFIGURAÇÃO ---
const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = process.env.MONGO_DATABASE;

/**
 * Classe Singleton para gerenciar a conexão com o MongoDB.
 * Garante que apenas uma instância de conexão seja usada em toda a aplicação.
 */
class MongoService {
  constructor() {
    this.client = new MongoClient(MONGO_URI);
    this.db = null;
  }

  /**
   * Conecta ao banco de dados. Deve ser chamado UMA VEZ na inicialização do servidor.
   */
  async connect() {
    if (this.db) {
      console.log("MongoDB já está conectado.");
      return;
    }
    try {
      await this.client.connect();
      this.db = this.client.db(DB_NAME);
      console.log("✅ Conectado ao MongoDB com sucesso.");
    } catch (error) {
      console.error("❌ Falha ao conectar com o MongoDB:", error);
      process.exit(1); // Encerra a aplicação se não conseguir conectar ao DB
    }
  }

  /**
   * Retorna a instância do banco de dados (db).
   */
  getDb() {
    if (!this.db) {
      throw new Error("A conexão com o MongoDB não foi inicializada. Chame o método connect() primeiro.");
    }
    return this.db;
  }

  /**
   * Retorna a instância do cliente (client). Essencial para transações.
   */
  getClient() {
    return this.client;
  }
}

// Cria e exporta uma instância ÚNICA da classe.
const mongoInstance = new MongoService();

/**
 * Sua função helper original, agora usando a instância segura do Singleton.
 * Você não precisa mudar como a chama no resto do seu código.
 */
function MongoDB() {
  const database = mongoInstance.getDb(); // Pega a conexão já estabelecida

  return {
    collection: (name) => {
      const collection = database.collection(name);
      const defaultCollation = { locale: 'pt', strength: 2 };

      // Seus métodos continuam funcionando da mesma forma
      return {
        find: (filter = {}, options = {}) => collection.find(filter, { ...options, collation: defaultCollation }),
        findOne: (filter = {}, options = {}) => collection.findOne(filter, { ...options, collation: defaultCollation }),
        count: (filter = {}, options = {}) => collection.countDocuments(filter, { ...options, collation: defaultCollation }),
        aggregate: (pipeline = [], options = {}) => collection.aggregate(pipeline, { ...options, collation: defaultCollation }),
        insertOne: (doc, options) => collection.insertOne(doc, options),
        updateOne: (filter, update, options) => collection.updateOne(filter, update, options),
        replaceOne: (filter, replacement, options) => collection.replaceOne(filter, replacement, options),
        deleteOne: (filter, options) => collection.deleteOne(filter, options),
        findOneAndUpdate: (filter, update, options) => collection.findOneAndUpdate(filter, update, options),
        findByIdAndUpdate: (id, update, options) => collection.findOneAndUpdate({ _id: id }, update, options),
        bulkWrite: (operations, options) => collection.bulkWrite(operations, options),
      };
    },
    // O getClient agora também usa a instância segura
    getClient: () => mongoInstance.getClient(),
  };
}

// Exporta a instância para o connect inicial e a sua função helper
module.exports = { mongoInstance, MongoDB };