const MailController = require("./mail.controller");
const MarketsController = require("./markets.controller");
const QueryController = require("./query.controller");
const ChartController = require("./chart.controller");
const CryptoController = require("./crypto.controller");
const UserController = require("./user.controller");
const PortfolioController = require("./portfolio.controller");

function IndexController(server) {
  MailController.mail(server);
  MarketsController.markets(server);
  QueryController.query(server);
  QueryController.insights(server);
  QueryController.summary(server);
  ChartController.series(server);
  ChartController.chart(server);
  UserController.create(server);
  UserController.auth(server);
  UserController.forgot(server);
  UserController.reset(server);
  PortfolioController.get(server);
  PortfolioController.upsert(server);
  CryptoController.quote(server);
  CryptoController.autocomplete(server);
}

module.exports = IndexController;
