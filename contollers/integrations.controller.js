const _integrations = require("../services/integrations.service");
var restify = require("restify");

let middleware = [
  restify.plugins.queryParser(),
  restify.plugins.bodyParser({
    mapParams: true,
  }),
];

const IntegrationsController = {
    etradeRequestToken: (server) => {
    server.get(
      "/api/v1/integrations/etrade/request-token",
      ...middleware,
      (req, res, next) => {
        _integrations.requestToken(req, res, next);
      }
    );
  },
  etradeAccessToken: (server) => {
    server.post(
      "/api/v1/integrations/etrade/access-token",
      ...middleware,
      (req, res, next) => {
        _integrations.accessToken(req, res, next);
      }
    );
  },
  etradeListAccounts: (server) => {
    server.post(
      "/api/v1/integrations/etrade/accounts/list",
      ...middleware,
      (req, res, next) => {
        _integrations.etradeListAccounts(req, res, next);
      }
    );
  },

  etradeTransactions: (server) => {
    server.post(
      "/api/v1/integrations/etrade/accounts/:accountIdKey/transactions",
      ...middleware,
      (req, res, next) => {
        _integrations.etradeTransactions(req, res, next);
      }
    );
  },
};

module.exports = IntegrationsController;
