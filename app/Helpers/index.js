"use strict";

const { getPaginationInfo, getPaginationResult } = require("./pagination");
const { trimObjectValues } = require("./trim");
const { escapeRegex } = require("./regex");

module.exports = { getPaginationInfo, getPaginationResult, trimObjectValues, escapeRegex };
