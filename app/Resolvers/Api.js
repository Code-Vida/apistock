"use strict";
const { MongoDB } = require("../database");

module.exports = {
  Query: {
    async version() {
      console.log("a");
      const insert = await MongoDB()
        .collection("teste")
        .insertOne({ id: 1, firstName: "Steve", lastName: "Jobs" });
      console.log("a", insert);
      return JSON.stringify(insert);
    },
  },
};
