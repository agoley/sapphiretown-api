const _stock = require("../services/stock.service");
var restify = require("restify");

let middleware = [
  restify.plugins.queryParser(),
  restify.plugins.bodyParser({
    mapParams: true,
  }),
];

const StockController = {
  quote: (server, messengers) => {
    server.post("/api/v1/stock/quote", ...middleware, (req, res, next) => {
      _stock.quote(req, res, next);
    });
  },
  indicators: (server, messengers) => {
    server.get("/api/v4/stock/:symbol/indicators", ...middleware, (req, res, next) => {
      _stock.indicators(req, res, next);
    });
  },
  symbol: (server) => {
    server.get("/api/v2/stock/:symbols", ...middleware, (req, res, next) => {
      _stock.symbol(req, res, next);
    });
  },
};

module.exports = StockController;
