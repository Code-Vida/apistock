const { MongoClient } = require("mongodb");

const MONGO_URI = "mongodb+srv://stockshoes:57IQdr2jRXYwYv5Q@stock.6zd9q1k.mongodb.net/?retryWrites=true&w=majority"; 
const DATABASE_NAME = "apistock";    
const SOURCE_COLLECTION = "salesReport"; 
const DESTINATION_COLLECTION = "sales";

const pipeline = [
    
    {
        $project: {
            _id: 0, 
            createdAt: "$salesDate",
            totalAmount: "$product.value",
            paymentMethod: "Não especificado", 
            items: [
                {
                    productId: "$product._id",
                    variants: {
                        color: "$product.color",
                        number: "$product.number"
                    },
                    quantity: "$salesAmount",
                    priceAtTimeOfSale: "$product.value",
                    costAtTimeOfSale: "$product.purchaseValue"
                }
            ]
        }
    },
    
    {
        $merge: {
            into: DESTINATION_COLLECTION
        }
    }
];


async function runMigration() {
    
    const client = new MongoClient(MONGO_URI);
    console.log("Iniciando script de migração...");

    try {
        
        await client.connect();
        console.log("✅ Conectado ao MongoDB com sucesso.");

        const database = client.db(DATABASE_NAME);
        const sourceCollection = database.collection(SOURCE_COLLECTION);

        console.log(`\nIniciando a migração da collection '${SOURCE_COLLECTION}' para '${DESTINATION_COLLECTION}'...`);
        console.log("Isso pode levar alguns instantes dependendo do volume de dados.");

        
        await sourceCollection.aggregate(pipeline).toArray();

        
        const oldDocsCount = await sourceCollection.countDocuments();
        const newDocsCount = await database.collection(DESTINATION_COLLECTION).countDocuments();

        console.log("\n--- Resultado da Migração ---");
        console.log(`Total de documentos na collection original: ${oldDocsCount}`);
        console.log(`Total de documentos na nova collection: ${newDocsCount}`);

        if (oldDocsCount === newDocsCount) {
            console.log("✅ Migração concluída com sucesso!");
            console.log(`Verifique a nova collection: '${DESTINATION_COLLECTION}'`);
        } else {
            console.log("⚠️ Atenção: O número de documentos não corresponde. Verifique os dados.");
        }

    } catch (error) {
        
        console.error("❌ Ocorreu um erro durante a migração:", error);
    } finally {
        
        await client.close();
        console.log("\nConexão com o MongoDB fechada.");
    }
}


runMigration();