const _portfolio = require("../services/portfolio.service");

const PortfolioController = {
  get: (server) => {
    server.get("/api/v1/portfolios/:userId", (req, res, next) => {
      _portfolio.get(req, res, next);
    });
  },
  upsert: (server) => {
    server.post("/api/v1/portfolios", (req, res, next) => {
      _portfolio.upsert(req, res, next);
    });
  },
  breakdown: (server) => {
    server.get("/api/v2/portfolio/breakdown/:userId", (req, res, next) => {
      _portfolio.breakdown(req, res, next);
    });
  },
  movers: (server) => {
    server.post("/api/v2/portfolio/movers", (req, res, next) => {
      _portfolio.movers(req, res, next);
    });
  },
};

module.exports = PortfolioController;
