const MailController = require("./mail.controller");
const MarketsController = require("./markets.controller");
const QueryController = require("./query.controller");
const ChartController = require("./chart.controller");
const CryptoController = require("./crypto.controller");
const UserController = require("./user.controller");
const PortfolioController = require("./portfolio.controller");
const StockController = require("./stock.controller");

function IndexController(server) {

  // mail endpoints
  MailController.mail(server);

  // markets endpoints
  MarketsController.markets(server);
  MarketsController.marketsLL(server);
  
  // query endpoints
  QueryController.query(server);
  QueryController.insights(server);
  QueryController.summary(server);

  // chart endpoints
  ChartController.series(server);
  ChartController.chart(server);
  ChartController.chartLL(server);

  // user endpoints
  UserController.get(server);
  UserController.create(server);
  UserController.auth(server);
  UserController.forgot(server);
  UserController.reset(server);
  UserController.update(server);
  UserController.update_password(server);
  UserController.subscribe(server);
  UserController.unsubscribe(server);

  // portfolio endpoints
  PortfolioController.get(server);
  PortfolioController.getById(server);
  PortfolioController.allByUser(server);
  PortfolioController.summary(server);
  PortfolioController.upsert(server);
  PortfolioController.update(server);
  PortfolioController.add(server);
  PortfolioController.delete(server);
  PortfolioController.breakdown(server);
  PortfolioController.movers(server);

  // crypto endpoints 
  CryptoController.quote(server);
  CryptoController.autocomplete(server);

  // stock endpoints
  StockController.quote(server);
}

module.exports = IndexController;
