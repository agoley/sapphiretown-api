const MarketsController = require("./markets.controller");
const QueryController = require("./query.controller");
const ChartController = require("./chart.controller");

function IndexController(server) {
  MarketsController.markets(server);
  QueryController.query(server);
  ChartController.series(server);
}

module.exports = IndexController;
