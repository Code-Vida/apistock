"use strict";
const { MongoDB } = require("../database");

module.exports = {
  Query: {
    async version() {
      return "oi";
    },
  },
};
