"use strict";

function trimObjectValues(obj) {
  if (Array.isArray(obj)) {
    return obj.map(trimObjectValues);
  } else if (obj && typeof obj === "object") {
    return Object.entries(obj).reduce((acc, [key, value]) => {
      acc[key] = trimObjectValues(value);
      return acc;
    }, {});
  } else if (typeof obj === "string") {
    return obj.trim();
  }
  return obj;
}


module.exports = { trimObjectValues };
