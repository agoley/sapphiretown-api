const MarketsController = require('./markets.controller');
const IntradayController = require('./intraday.controller');

function IndexController(server) {
  MarketsController.markets(server);
  IntradayController.query(server);
};

module.exports = IndexController;
