const _markets = require("../services/markets.service");
var restify = require("restify");

let middleware = [
  restify.plugins.queryParser(),
  restify.plugins.bodyParser({
    mapParams: true,
  }),
];

const MarketsController = {
  markets: (server) => {
    server.get("/markets", ...middleware, (req, res, next) => {
      _markets.markets(req, res, next);
    });
    server.post("/autocomplete", ...middleware, (req, res, next) => {
      _markets.autocomplete(req, res, next);
    });
  },
  marketsLL: (server) => {
    server.get("/api/v3/marketsLL", ...middleware, (req, res, next) => {
      _markets.marketsLL(req, res, next);
    });
  },
};

module.exports = MarketsController;
