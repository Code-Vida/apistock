"use strict";
const { v4: uuidv4 } = require('uuid');

module.exports = {
    Query: {
        searchCustomers: async (_, { searchText }, { MongoDB }) => {
            const searchRegex = new RegExp(searchText, 'i');
            const customers = await MongoDB().collection('customers').find({
                $or: [
                    { name: searchRegex },
                    { phone: searchRegex }
                ]
            }).limit(20).toArray();
            return customers;
        },
    },

    Mutation: {
        createCustomer: async (_, { input }, { MongoDB }) => {
            const newCustomer = {
                _id: uuidv4(),
                ...input,
                createdAt: new Date(),
            };
            await MongoDB().collection('customers').insertOne(newCustomer);
            return newCustomer;
        },

    }
}