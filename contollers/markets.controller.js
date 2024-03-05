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
      try {
        _markets.markets(req, res, next);
      } catch (err) {
        console.error("/markets error: " + err);
      }
    });
    server.post("/autocomplete", ...middleware, (req, res, next) => {
      try {
        _markets.autocomplete(req, res, next);
      } catch (err) {
        console.error("/autocomplete error: " + err);
      }
    });
  },
  marketsLL: (server) => {
    server.get("/api/v3/marketsLL", ...middleware, (req, res, next) => {
      try {
        _markets.marketsLL(req, res, next);
      } catch (err) {
        console.error("/api/v3/marketsLL error: " + err);
      }
    });
  },
  trending: (server) => {
    server.get("/api/v3/markets/trending", ...middleware, (req, res, next) => {
      try {
        _markets.trending(req, res, next);
      } catch (err) {
        console.error("/api/v3/markets/trending error: " + err);
      }
    });
  },
};

module.exports = MarketsController;
