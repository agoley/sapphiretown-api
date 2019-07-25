const ms = require('../services/markets.service');

const MarketsController = {
    markets: (server) => {
      server.get("/markets/nasdaq", (req, res, next) => { ms.nasdaq(req, res, next) });
    }
}

module.exports = MarketsController;

