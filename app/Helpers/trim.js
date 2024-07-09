"use strict";

function trimObjectValues(obj) {
  if (obj && typeof obj === "object") {
    if (Array.isArray(obj)) {
      return obj.map((item) => trimObjectValues(item));
    } else {
      for (let key in obj) {
        if (obj.hasOwnProperty(key)) {
          obj[key] = trimObjectValues(obj[key]);
        }
      }
    }
  } else if (typeof obj === "string") {
    return obj.trim();
  }
  return obj;
}

module.exports = { trimObjectValues };
