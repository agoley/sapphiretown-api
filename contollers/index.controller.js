const MarketsController = require("./markets.controller");
const QueryController = require("./query.controller");
const SeriesController = require("./series.controller");

function IndexController(server) {
  MarketsController.markets(server);
  QueryController.query(server);
  SeriesController.series(server);
}

module.exports = IndexController;
