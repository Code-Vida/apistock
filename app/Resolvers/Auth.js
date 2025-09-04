/* eslint-disable no-undef */
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');



const JWT_SECRET = process.env.JWT_SECRET;

module.exports = {
    Query: {
        
        me: async (_, __, context) => {
            if (!context.user) {
                return null; 
            }
            
            const user = await context.MongoDB(context).collection('users').findOne({ _id: context.user.userId });
            const store = await context.MongoDB(context).collection('stores').findOne({ _id: user.storeId });
            user.store = store; 
            return user;
        },
    },

    Mutation: {
        signUp: async (_, { storeName, name, email, password }, context) => {
            const { client } = context;

            
            if (!password || password.length < 6) {
                throw new Error('A senha precisa ter no mínimo 6 caracteres.');
            }
            if (!storeName || storeName.trim() === '') {
                throw new Error('O nome da loja é obrigatório.');
            }

            const session = client.startSession();

            try {
                let authPayload; 

                await session.withTransaction(async () => {
                    
                    
                    const existingUser = await context.MongoDB(context).collection('users').findOne({ email }, { session });
                    if (existingUser) {
                        throw new Error('Este e-mail já está em uso.');
                    }

                    
                    const newStore = {
                        _id: uuidv4(),
                        name: storeName,
                        createdAt: new Date(),
                    };
                    await context.MongoDB(context).collection('stores').insertOne(newStore, { session });

                    
                    const hashedPassword = await bcrypt.hash(password, 12);

                    
                    const newUser = {
                        _id: uuidv4(),
                        name,
                        email,
                        password: hashedPassword,
                        role: 'ADMIN', 
                        storeId: newStore._id, 
                        createdAt: new Date(),
                    };
                    await context.MongoDB(context).collection('users').insertOne(newUser, { session });

                    
                    const token = jwt.sign(
                        { userId: newUser._id, storeId: newUser.storeId, role: newUser.role },
                        JWT_SECRET,
                        { expiresIn: '7d' } 
                    );

                    
                    authPayload = {
                        token,
                        user: { ...newUser, store: newStore },
                    };
                });

                return authPayload;

            } catch (error) {
                console.error("Erro durante o cadastro:", error);
                
                throw new Error(error.message || "Não foi possível concluir o cadastro.");
            } finally {
                await session.endSession();
            }
        },

        login: async (_, { email, password }, context) => {
            
            const user = await context.MongoDB(context).collection('users').findOne({ email });
            if (!user) {
                throw new Error('Usuário não encontrado ou senha inválida.');
            }

            
            const isValid = await bcrypt.compare(password, user.password);
            if (!isValid) {
                throw new Error('Usuário não encontrado ou senha inválida.');
            }

            
            const store = await context.MongoDB(context).collection('stores').findOne({ _id: user.storeId });
            if (!store) {
                throw new Error('Loja associada a este usuário não foi encontrada.');
            }

            
            const token = jwt.sign(
                { userId: user._id, storeId: user.storeId, role: user.role },
                JWT_SECRET,
                { expiresIn: '7d' }
            );

            
            return {
                token,
                user: { ...user, store: store },
            };
        },
    },
};
