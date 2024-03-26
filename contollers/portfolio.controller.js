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
        try {
          _portfolio.get(req, res, next);
        } catch (err) {
          console.error("/api/v1/portfolios/:userId error: " + err);
        }
      }
    );
  },
  getById: (server) => {
    server.get("/api/v3/portfolios/:id", ...middleware, (req, res, next) => {
      try {
        _portfolio.getById(req, res, next);
      } catch (err) {
        console.error("/api/v3/portfolios/:id error: " + err);
      }
    });
  },
  allByUser: (server) => {
    server.get(
      "/api/v2/portfolios/:userId",
      ...middleware,
      (req, res, next) => {
        try {
          _portfolio.allByUser(req, res, next);
        } catch (err) {
          console.error("/api/v2/portfolios/:userId error: " + err);
        }
      }
    );
  },
  summary: (server) => {
    server.get(
      "/api/v2/portfolio/:id/summary",
      ...middleware,
      (req, res, next) => {
        try {
          _portfolio.summary(req, res, next);
        } catch (err) {
          console.error("/api/v2/portfolio/:id/summary error: " + err);
        }
      }
    );
  },
  holding: (server) => {
    server.get(
      "/api/v2/portfolios/:id/:symbol",
      ...middleware,
      (req, res, next) => {
        try {
          _portfolio.holding(req, res, next);
        } catch (err) {
          console.error("/api/v2/portfolios/:id/:symbol error: " + err);
        }
      }
    );
  },
  update: (server) => {
    server.post("/api/v3/portfolios/:id", ...middleware, (req, res, next) => {
      try {
        _portfolio.update(req, res, next);
      } catch (err) {
        console.error("/api/v3/portfolios/:id error: " + err);
      }
    });
  },
  add: (server) => {
    server.post("/api/v3/portfolios", ...middleware, (req, res, next) => {
      try {
        _portfolio.add(req, res, next);
      } catch (err) {
        console.error("/api/v3/portfolios error: " + err);
      }
    });
  },
  delete: (server) => {
    server.del("/api/v3/portfolios/:id", ...middleware, (req, res, next) => {
      try {
        _portfolio.delete(req, res, next);
      } catch (err) {
        console.error("/api/v3/portfolios error: " + err);
      }
    });
  },
  removeTransaction: (server) => {
    server.post("/api/v3/portfolios/:id/transaction", ...middleware, (req, res, next) => {
      try {
        _portfolio.removeTransaction(req, res, next);
      } catch (err) {
        console.error("/api/v3/portfolios/:id/transaction error: " + err);
      }
    });
  },
  upsert: (server) => {
    server.post("/api/v1/portfolios", ...middleware, (req, res, next) => {
      try {
        _portfolio.upsert(req, res, next);
      } catch (err) {
        console.error("/api/v1/portfolios error: " + err);
      }
    });
  },
  breakdown: (server) => {
    server.get(
      "/api/v2/portfolio/breakdown/:id",
      ...middleware,
      (req, res, next) => {
        try {
          _portfolio.breakdown(req, res, next);
        } catch (err) {
          console.error("/api/v2/portfolio/breakdown/:id error: " + err);
        }
      }
    );
  },
  movers: (server) => {
    server.post(
      "/api/v2/portfolio/:id/movers",
      ...middleware,
      (req, res, next) => {
        try {
          _portfolio.movers(req, res, next);
        } catch (err) {
          console.error("/api/v2/portfolio/:id/movers error: " + err);
        }
      }
    );
  },
  action: (server) => {
    server.post(
      "/api/v2/portfolio/:id/action",
      ...middleware,
      (req, res, next) => {
        try {
          _portfolio.action(req, res, next);
        } catch (err) {
          console.error("/api/v2/portfolio/:id/action error: " + err);
        }
      }
    );
  },
  comparison: (server) => {
    server.post(
      "/api/v2/portfolio/:id/comparison",
      ...middleware,
      (req, res, next) => {
        try {
          _portfolio.comparison(req, res, next);
        } catch (err) {
          console.error("/api/v2/portfolio/:id/comparison error: " + err);
        }
      }
    );
  },
  preview: (server) => {
    server.post("/api/v3/parser/preview", (req, res, next) => {
      try {
        _portfolio.preview(req, res, next);
      } catch (err) {
        console.error("/api/v3/parser/preview error: " + err);
      }
    });
  },
  upload: (server) => {
    server.post("/api/v3/portfolios/:id/transactions", (req, res, next) => {
      try {
        _portfolio.upload(req, res, next);
      } catch (err) {
        console.error("/api/v3/portfolios/:id/transactions error: " + err);
      }
    });
  },
  bulkAdd: (server) => {
    server.post(
      "/api/v4/portfolios/:id/transactions",
      ...middleware,
      (req, res, next) => {
        try {
          _portfolio.bulkAdd(req, res, next);
        } catch (err) {
          console.error("/api/v4/portfolios/:id/transactions error: " + err);
        }
      }
    );
  },
};

module.exports = PortfolioController;
