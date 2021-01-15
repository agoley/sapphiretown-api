const _crypto = require("../services/crypto.service");

const CryptoController = {
  quote: (server) => {
    server.post("/api/v1/crypto/qoute", (req, res, next) => {
      _crypto.qoute(req, res, next);
    });
  },
  autocomplete: (server) => {
    server.post("/api/v1/crypto/autocomplete", (req, res, next) => {
      _crypto.autocomplete(req, res, next);
    });
  },
};

module.exports = CryptoController;
