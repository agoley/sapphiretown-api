const _crypto = require("../services/crypto.service");
var restify = require("restify");

let middleware = [
  restify.plugins.queryParser(),
  restify.plugins.bodyParser({
    mapParams: true,
  }),
];

const CryptoController = {
  quote: (server) => {
    server.post("/api/v1/crypto/qoute", ...middleware, (req, res, next) => {
      _crypto.qoute(req, res, next);
    });
  },
  autocomplete: (server) => {
    server.post("/api/v1/crypto/autocomplete", ...middleware, (req, res, next) => {
      _crypto.autocomplete(req, res, next);
    });
  },
};

module.exports = CryptoController;
