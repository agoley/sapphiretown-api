const _markets = require("../services/markets.service");

const MarketsController = {
  markets: server => {
    server.get("/markets", (req, res, next) => {
      _markets.markets(req, res, next);
    });
    server.post("/autocomplete", (req, res, next) => {
      _markets.autocomplete(req, res, next);
    });
  }
};

module.exports = MarketsController;
