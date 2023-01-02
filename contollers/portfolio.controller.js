const _portfolio = require("../services/portfolio.service");

const PortfolioController = {
  get: (server) => {
    server.get("/api/v1/portfolios/:userId", (req, res, next) => {
      _portfolio.get(req, res, next);
    });
  },
  getById: (server) => {
    server.get("/api/v3/portfolios/:id", (req, res, next) => {
      _portfolio.getById(req, res, next);
    });
  },
  allByUser: (server) => {
    server.get("/api/v2/portfolios/:userId", (req, res, next) => {
      _portfolio.allByUser(req, res, next);
    });
  },
  summary: (server) => {
    server.get("/api/v2/portfolios/:id/summary", (req, res, next) => {
      _portfolio.summary(req, res, next);
    });
  },
  update: (server) => {
    server.post("/api/v3/portfolios/:id", (req, res, next) => {
      _portfolio.update(req, res, next);
    });
  },
  add: (server) => {
    server.post("/api/v3/portfolios", (req, res, next) => {
      _portfolio.add(req, res, next);
    });
  },
  delete: (server) => {
    server.del("/api/v3/portfolios/:id", (req, res, next) => {
      _portfolio.delete(req, res, next);
    });
  },
  upsert: (server) => {
    server.post("/api/v1/portfolios", (req, res, next) => {
      _portfolio.upsert(req, res, next);
    });
  },
  breakdown: (server) => {
    server.get("/api/v2/portfolio/breakdown/:id", (req, res, next) => {
      _portfolio.breakdown(req, res, next);
    });
  },
  movers: (server) => {
    server.post("/api/v2/portfolio/:id/movers", (req, res, next) => {
      _portfolio.movers(req, res, next);
    });
  },
  action: (server) => {
    server.post("/api/v2/portfolio/:id/action", (req, res, next) => {
      _portfolio.action(req, res, next);
    });
  },
  comparison: (server) => {
    server.post("/api/v2/portfolio/:id/comparison", (req, res, next) => {
      _portfolio.comparison(req, res, next);
    });
  },
};

module.exports = PortfolioController;
