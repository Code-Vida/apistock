const { MongoClient } = require("mongodb");
const { v4: uuidv4 } = require("uuid");

const MONGO_URI = "mongodb://localhost:27017"; // Sua string de conexão com o MongoDB
const DATABASE_NAME = "apistock";    // O nome do seu banco de dados
const SOURCE_COLLECTION = "salesReport"; // Sua collection de vendas atual
const DESTINATION_COLLECTION = "sales";

const pipeline = [
    // Etapa 1: Remodelar cada documento
    {
        $project: {
            _id: 0, // Exclui o _id antigo para que o MongoDB gere um novo e único
            createdAt: "$salesDate",
            totalAmount: "$product.value",
            paymentMethod: "Não especificado", // Valor padrão para o novo campo
            items: [
                {
                    productId: "$product._id",
                    variantInfo: {
                        color: "$product.color",
                        size: "$product.number"
                    },
                    quantity: "$salesAmount",
                    priceAtTimeOfSale: "$product.value",
                    costAtTimeOfSale: "$product.purchaseValue"
                }
            ]
        }
    },
    // Etapa 2: Salvar os documentos transformados
    {
        $merge: {
            into: DESTINATION_COLLECTION
        }
    }
];


async function runMigration() {
    // Cria uma nova instância do cliente MongoDB
    const client = new MongoClient(MONGO_URI);
    console.log("Iniciando script de migração...");

    try {
        // Conecta ao servidor MongoDB
        await client.connect();
        console.log("✅ Conectado ao MongoDB com sucesso.");

        const database = client.db(DATABASE_NAME);
        const sourceCollection = database.collection(SOURCE_COLLECTION);

        console.log(`\nIniciando a migração da collection '${SOURCE_COLLECTION}' para '${DESTINATION_COLLECTION}'...`);
        console.log("Isso pode levar alguns instantes dependendo do volume de dados.");

        // Executa o pipeline de agregação
        await sourceCollection.aggregate(pipeline).toArray();

        // Conta os documentos para verificar
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
        // Em caso de erro, imprime no console
        console.error("❌ Ocorreu um erro durante a migração:", error);
    } finally {
        // Garante que a conexão com o cliente será fechada ao final
        await client.close();
        console.log("\nConexão com o MongoDB fechada.");
    }
}

// Executa a função principal do script
runMigration();