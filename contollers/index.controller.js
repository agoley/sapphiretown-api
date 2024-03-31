const MailController = require("./mail.controller");
const MarketsController = require("./markets.controller");
const QueryController = require("./query.controller");
const ChartController = require("./chart.controller");
const CryptoController = require("./crypto.controller");
const UserController = require("./user.controller");
const PortfolioController = require("./portfolio.controller");
const StockController = require("./stock.controller");
const IntegrationsController = require("./integrations.controller");

function IndexController(server, isEnterprise) {
  // mail endpoints
  if (!isEnterprise) MailController.mail(server);

  // markets endpoints
  MarketsController.markets(server);
  MarketsController.marketsLL(server);
  MarketsController.trending(server);

  // query endpoints
  QueryController.query(server);
  QueryController.insights(server);
  QueryController.summary(server);

  // chart endpoints
  ChartController.series(server);
  ChartController.chart(server);
  ChartController.chartLL(server);
  ChartController.chartLLV3(server);
  ChartController.chartLLV4(server);

  // user endpoints
  UserController.get(server);
  UserController.create(server);
  UserController.createV3(server);
  UserController.auth(server);
  if (!isEnterprise) UserController.forgot(server);
  if (!isEnterprise) UserController.reset(server);
  UserController.update(server);
  UserController.update_watchlist(server);
  UserController.update_password(server);
  if (!isEnterprise) UserController.subscribe(server);
  if (!isEnterprise) UserController.unsubscribe(server);
  UserController.find(server);
  if (!isEnterprise) UserController.notificationsSubscribe(server);
  if (!isEnterprise) UserController.notificationsUnsubscribe(server);
  if (!isEnterprise) UserController.pushSubscription(server);
  if (!isEnterprise) UserController.paymentMethods(server);
  if (!isEnterprise) UserController.charges(server);
  if (!isEnterprise) UserController.updatePaymentMethod(server); 
  if (!isEnterprise) UserController.getUpcomingInvoice(server);
  
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
  PortfolioController.preview(server);
  PortfolioController.bulkAdd(server);
  PortfolioController.holding(server);
  PortfolioController.removeTransaction(server);

  // crypto endpoints
  CryptoController.quote(server);
  CryptoController.autocomplete(server);

  // stock endpoints
  StockController.quote(server);
  StockController.indicators(server);
  StockController.news(server);
  StockController.symbol(server);
  StockController.summary(server);

  // integrations endpoints
  IntegrationsController.etradeRequestToken(server);
  IntegrationsController.etradeAccessToken(server);
  IntegrationsController.etradeListAccounts(server);
  IntegrationsController.etradeTransactions(server);
  IntegrationsController.coinbaseListAccounts(server);
  IntegrationsController.coinbaseTransactions(server);
  IntegrationsController.coinbaseTransaction(server);
  IntegrationsController.coinbaseAccessToken(server);
  IntegrationsController.coinbaseResource(server);
}

module.exports = IndexController;
