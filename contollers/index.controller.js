const MailController = require("./mail.controller");
const MarketsController = require("./markets.controller");
const QueryController = require("./query.controller");
const ChartController = require("./chart.controller");
const CryptoController = require("./crypto.controller");
const UserController = require("./user.controller");
const PortfolioController = require("./portfolio.controller");
const StockController = require("./stock.controller");

function IndexController(server, isEnterprise) {

  // mail endpoints
  if (!isEnterprise) MailController.mail(server);

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
  if (!isEnterprise)UserController.forgot(server);
  if (!isEnterprise)UserController.reset(server);
  UserController.update(server);
  UserController.update_password(server);
  if (!isEnterprise) UserController.subscribe(server);
  if (!isEnterprise) UserController.unsubscribe(server);
  UserController.find(server);

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
  PortfolioController.action(server);
  PortfolioController.comparison(server);
  PortfolioController.upload(server);
  PortfolioController.bulkAdd(server);
  PortfolioController.holding(server);

  // crypto endpoints 
  CryptoController.quote(server);
  CryptoController.autocomplete(server);

  // stock endpoints
  StockController.quote(server);
  StockController.quoteV2(server);
  StockController.symbol(server);
}

module.exports = IndexController;
