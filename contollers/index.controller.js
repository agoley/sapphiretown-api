const MarketsController = require('./markets.controller');

function IndexController(server) {
  MarketsController.markets(server);
};

module.exports = IndexController;
