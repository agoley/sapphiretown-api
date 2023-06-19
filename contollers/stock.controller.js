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
  quoteV2: (server, messengers) => {
    server.get("/api/v2/quote/:symbol", ...middleware, (req, res, next) => {
      _stock.quoteV2(req, res, next);
    });
  },
  symbol: (server) => {
    server.get("/api/v2/stock/:symbols", ...middleware, (req, res, next) => {
      _stock.symbol(req, res, next);
    });
  },
};

module.exports = StockController;
