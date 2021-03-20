const _stock = require("../services/stock.service");

const StockController = {
  quote: (server, messengers) => {
    server.post("/api/v1/stock/quote", (req, res, next) => {
      _stock.quote(req, res, next);
    });
  },
};

module.exports = StockController;
