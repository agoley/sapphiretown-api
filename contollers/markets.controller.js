const _markets = require('../services/markets.service');

const MarketsController = {
    markets: (server) => {
      server.get("/markets/nasdaq", (req, res, next) => { _markets.nasdaq(req, res, next) });
    }
}

module.exports = MarketsController;

