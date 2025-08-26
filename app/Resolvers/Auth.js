const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// A chave secreta para assinar os tokens. Guarde isso no seu .env!
// eslint-disable-next-line no-undef
const JWT_SECRET = process.env.JWT_SECRET;

module.exports = {
    Query: {
        // Busca o usuário logado a partir do contexto
        me: async (_, __, context) => {
            if (!context.user) {
                return null; // Nenhum usuário logado
            }
            // Busca os dados completos do usuário, incluindo a loja
            const user = await context.MongoDB(context).collection('users').findOne({ _id: context.user.userId });
            const store = await context.MongoDB(context).collection('stores').findOne({ _id: user.storeId });
            user.store = store; // Aninha os dados da loja
            return user;
        },
    },

    Mutation: {
        signUp: async (_, { storeName, name, email, password }, context) => {
            const { client } = context;

            // --- 1. Validações Iniciais ---
            if (!password || password.length < 6) {
                throw new Error('A senha precisa ter no mínimo 6 caracteres.');
            }
            if (!storeName || storeName.trim() === '') {
                throw new Error('O nome da loja é obrigatório.');
            }

            const session = client.startSession();

            try {
                let authPayload; // Variável para guardar o resultado final

                await session.withTransaction(async () => {
                    // --- 2. Verifica se o e-mail já existe (em qualquer loja) ---
                    // Usamos context.MongoDB(context) para acessar a collection 'users'
                    const existingUser = await context.MongoDB(context).collection('users').findOne({ email }, { session });
                    if (existingUser) {
                        throw new Error('Este e-mail já está em uso.');
                    }

                    // --- 3. Cria a nova loja ---
                    const newStore = {
                        _id: uuidv4(),
                        name: storeName,
                        createdAt: new Date(),
                    };
                    await context.MongoDB(context).collection('stores').insertOne(newStore, { session });

                    // --- 4. Criptografa a senha do usuário ---
                    const hashedPassword = await bcrypt.hash(password, 12);

                    // --- 5. Cria o novo usuário (o primeiro é sempre ADMIN) ---
                    const newUser = {
                        _id: uuidv4(),
                        name,
                        email,
                        password: hashedPassword,
                        role: 'ADMIN', // O primeiro usuário da loja é o administrador
                        storeId: newStore._id, // Vincula o usuário à loja recém-criada
                        createdAt: new Date(),
                    };
                    await context.MongoDB(context).collection('users').insertOne(newUser, { session });

                    // --- 6. Gera o Token de Autenticação (JWT) ---
                    const token = jwt.sign(
                        { userId: newUser._id, storeId: newUser.storeId, role: newUser.role },
                        JWT_SECRET,
                        { expiresIn: '7d' } // Token expira em 7 dias
                    );

                    // --- 7. Prepara o resultado para retornar ---
                    authPayload = {
                        token,
                        user: { ...newUser, store: newStore },
                    };
                });

                return authPayload;

            } catch (error) {
                console.error("Erro durante o cadastro:", error);
                // Repassa a mensagem de erro para o frontend
                throw new Error(error.message || "Não foi possível concluir o cadastro.");
            } finally {
                await session.endSession();
            }
        },

        login: async (_, { email, password }, context) => {
            // 1. Encontra o usuário pelo e-mail
            const user = await context.MongoDB(context).collection('users').findOne({ email });
            if (!user) {
                throw new Error('Usuário não encontrado ou senha inválida.');
            }

            // 2. Compara a senha fornecida com a senha criptografada no banco
            const isValid = await bcrypt.compare(password, user.password);
            if (!isValid) {
                throw new Error('Usuário não encontrado ou senha inválida.');
            }

            // 3. Busca os dados da loja associada
            const store = await context.MongoDB(context).collection('stores').findOne({ _id: user.storeId });
            if (!store) {
                throw new Error('Loja associada a este usuário não foi encontrada.');
            }

            // 4. Gera o Token de Autenticação (JWT)
            const token = jwt.sign(
                { userId: user._id, storeId: user.storeId, role: user.role },
                JWT_SECRET,
                { expiresIn: '7d' }
            );

            // 5. Retorna o payload completo
            return {
                token,
                user: { ...user, store: store },
            };
        },
    },
};
