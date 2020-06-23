const MarketsController = require("./markets.controller");
const QueryController = require("./query.controller");
const ChartController = require("./chart.controller");
const UserController = require("./user.controller");
const PortfolioController = require("./portfolio.controller");

function IndexController(server) {
  MarketsController.markets(server);
  QueryController.query(server);
  ChartController.series(server);    
  UserController.create(server);   
  UserController.auth(server);   
  PortfolioController.get(server);
  PortfolioController.upsert(server);
}

module.exports = IndexController;
