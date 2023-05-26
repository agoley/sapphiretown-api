const _portfolio = require("../services/portfolio.service");
var restify = require("restify");

let middleware = [
  restify.plugins.queryParser(),
  restify.plugins.bodyParser({
    mapParams: true,
  }),
];

const PortfolioController = {
  get: (server) => {
    server.get(
      "/api/v1/portfolios/:userId",
      ...middleware,
      (req, res, next) => {
        _portfolio.get(req, res, next);
      }
    );
  },
  getById: (server) => {
    server.get("/api/v3/portfolios/:id", ...middleware, (req, res, next) => {
      _portfolio.getById(req, res, next);
    });
  },
  allByUser: (server) => {
    server.get(
      "/api/v2/portfolios/:userId",
      ...middleware,
      (req, res, next) => {
        _portfolio.allByUser(req, res, next);
      }
    );
  },
  summary: (server) => {
    server.get(
      "/api/v2/portfolios/:id/summary",
      ...middleware,
      (req, res, next) => {
        _portfolio.summary(req, res, next);
      }
    );
  },
  holding: (server) => {
    server.get(
      "/api/v2/portfolios/:id/:symbol",
      ...middleware,
      (req, res, next) => {
        _portfolio.holding(req, res, next);
      }
    );
  },
  update: (server) => {
    server.post("/api/v3/portfolios/:id", ...middleware, (req, res, next) => {
      _portfolio.update(req, res, next);
    });
  },
  add: (server) => {
    server.post("/api/v3/portfolios", ...middleware, (req, res, next) => {
      _portfolio.add(req, res, next);
    });
  },
  delete: (server) => {
    server.del("/api/v3/portfolios/:id", ...middleware, (req, res, next) => {
      _portfolio.delete(req, res, next);
    });
  },
  upsert: (server) => {
    server.post("/api/v1/portfolios", ...middleware, (req, res, next) => {
      _portfolio.upsert(req, res, next);
    });
  },
  breakdown: (server) => {
    server.get(
      "/api/v2/portfolio/breakdown/:id",
      ...middleware,
      (req, res, next) => {
        _portfolio.breakdown(req, res, next);
      }
    );
  },
  movers: (server) => {
    server.post(
      "/api/v2/portfolio/:id/movers",
      ...middleware,
      (req, res, next) => {
        _portfolio.movers(req, res, next);
      }
    );
  },
  action: (server) => {
    server.post(
      "/api/v2/portfolio/:id/action",
      ...middleware,
      (req, res, next) => {
        _portfolio.action(req, res, next);
      }
    );
  },
  comparison: (server) => {
    server.post(
      "/api/v2/portfolio/:id/comparison",
      ...middleware,
      (req, res, next) => {
        _portfolio.comparison(req, res, next);
      }
    );
  },
  upload: (server) => {
    server.post("/api/v3/portfolios/:id/transactions", (req, res, next) => {
      _portfolio.upload(req, res, next);
    });
  },
  bulkAdd: (server) => {
    server.post(
      "/api/v4/portfolios/:id/transactions",
      ...middleware,
      (req, res, next) => {
        _portfolio.bulkAdd(req, res, next);
      }
    );
  },
};

module.exports = PortfolioController;
