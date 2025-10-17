/* eslint-disable no-undef */
const { MongoClient } = require('mongodb');
require('dotenv').config(); 



const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/?replicaSet=rs0";
const DATABASE_NAME = process.env.MONGO_DATABASE || "seu_banco_de_dados";


const STORE_ID = "705fe7b0-1a27-4356-a727-9ec809c3d96d";



const COLLECTIONS_TO_UPDATE = [
    "products_new",
    "sales",
    "customers",
    "suppliers",
    "purchase_orders",
    "cash", 
    "cash_movements",
];



async function runUpdate() {
    if (!STORE_ID) {
        console.error("❌ Erro: STORE_ID não está definido. Verifique a variável no script.");
        return;
    }

    const client = new MongoClient(MONGO_URI);
    console.log("Iniciando script de atualização para adicionar storeId...");

    try {
        await client.connect();
        console.log("✅ Conectado ao MongoDB com sucesso.");

        const database = client.db(DATABASE_NAME);
        let totalUpdated = 0;

        
        for (const collectionName of COLLECTIONS_TO_UPDATE) {
            console.log(`\nVerificando a collection: '${collectionName}'...`);
            const collection = database.collection(collectionName);

            
            const result = await collection.updateMany(
                
                { storeId: { $exists: false } },
                
                { $set: { storeId: STORE_ID } }
            );

            if (result.modifiedCount > 0) {
                console.log(`  -> ✅ Sucesso! ${result.modifiedCount} documentos foram atualizados.`);
                totalUpdated += result.modifiedCount;
            } else {
                console.log("  -> ℹ️ Nenhum documento precisou de atualização.");
            }
        }

        console.log("\n--- Atualização Concluída ---");
        console.log(`Total de documentos modificados em todas as collections: ${totalUpdated}`);

    } catch (error) {
        console.error("❌ Ocorreu um erro durante a atualização:", error);
    } finally {
        await client.close();
        console.log("\nConexão com o MongoDB fechada.");
    }
}


runUpdate();
