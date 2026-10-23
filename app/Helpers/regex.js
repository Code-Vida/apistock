"use strict";

// Escapa caracteres especiais para usar texto do usuário dentro de um RegExp
// (evita ReDoS e buscas que casam mais do que deveriam).
function escapeRegex(text = "") {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = { escapeRegex };
