const MarketsController = require("./markets.controller");
const QueryController = require("./query.controller");
const ChartController = require("./chart.controller");
const UserController = require("./user.controller");

function IndexController(server) {
  MarketsController.markets(server);
  QueryController.query(server);
  ChartController.series(server);    
  UserController.create(server);   
  UserController.auth(server);   
}

module.exports = IndexController;
