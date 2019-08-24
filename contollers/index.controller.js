const MarketsController = require("./markets.controller");
const QueryController = require("./query.controller");

function IndexController(server) {
  MarketsController.markets(server);
  QueryController.query(server);
}

module.exports = IndexController;
