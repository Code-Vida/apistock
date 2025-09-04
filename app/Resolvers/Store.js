"use strict";

module.exports = {
    Query: {
        async getStore(_, __, context) {
            const { user } = context;
            const store = await context.MongoDB(context).collection("stores").findOne({ _id: user.storeId });
            console.log('tore', store)
            return store;
        }
    }
}