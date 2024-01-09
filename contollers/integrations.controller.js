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
    try {
      server.get(
        "/api/v1/integrations/etrade/request-token",
        ...middleware,
        (req, res, next) => {
          _integrations.requestToken(req, res, next);
        }
      );
    } catch (err) {
      console.error("/api/v1/integrations/etrade/request-token error: " + err);
    }
  },
  etradeAccessToken: (server) => {
    server.post(
      "/api/v1/integrations/etrade/access-token",
      ...middleware,
      (req, res, next) => {
        try {
          _integrations.accessToken(req, res, next);
        } catch (err) {
          console.error(
            "/api/v1/integrations/etrade/access-token error: " + err
          );
        }
      }
    );
  },
  etradeListAccounts: (server) => {
    server.post(
      "/api/v1/integrations/etrade/accounts/list",
      ...middleware,
      (req, res, next) => {
        try {
          _integrations.etradeListAccounts(req, res, next);
        } catch (err) {
          console.error(
            "/api/v1/integrations/etrade/accounts/list error: " + err
          );
        }
      }
    );
  },

  etradeTransactions: (server) => {
    server.post(
      "/api/v1/integrations/etrade/accounts/:accountIdKey/transactions",
      ...middleware,
      (req, res, next) => {
        try {
          _integrations.etradeTransactions(req, res, next);
        } catch (err) {
          console.error(
            "/api/v1/integrations/etrade/accounts/:accountIdKey/transactions error: " +
              err
          );
        }
      }
    );
  },

  coinbaseListAccounts: (server) => {
    server.post(
      "/api/v1/integrations/coinbase/accounts/list",
      ...middleware,
      (req, res, next) => {
        try {
          _integrations.coinbaseListAccounts(req, res, next);
        } catch (err) {
          console.error(
            "/api/v1/integrations/coinbase/accounts/list error: " + err
          );
        }
      }
    );
  },

  coinbaseTransactions: (server) => {
    server.post(
      "/api/v1/integrations/coinbase/transactions",
      ...middleware,
      (req, res, next) => {
        try {
          _integrations.coinbaseTransactions(req, res, next);
        } catch (err) {
          console.error(
            "/api/v1/integrations/coinbase/transactions error: " + err
          );
        }
      }
    );
  },

  coinbaseTransaction: (server) => {
    server.post(
      "/api/v1/integrations/coinbase/transaction",
      ...middleware,
      (req, res, next) => {
        try {
          _integrations.coinbaseTransaction(req, res, next);
        } catch (err) {
          console.error(
            "/api/v1/integrations/coinbase/transaction error: " + err
          );
        }
      }
    );
  },

  coinbaseAccessToken: (server) => {
    server.post(
      "/api/v1/integrations/coinbase/access-token",
      ...middleware,
      (req, res, next) => {
        try {
          _integrations.coinbaseAccessToken(req, res, next);
        } catch (err) {
          console.error(
            "/api/v1/integrations/coinbase/access-token error: " + err
          );
        }
      }
    );
  },

  coinbaseResource: (server) => {
    server.post(
      "/api/v1/integrations/coinbase/resource",
      ...middleware,
      (req, res, next) => {
        try {
          _integrations.coinbaseResource(req, res, next);
        } catch (err) {
          console.error("/api/v1/integrations/coinbase/resource error: " + err);
        }
      }
    );
  },
};

module.exports = IntegrationsController;
