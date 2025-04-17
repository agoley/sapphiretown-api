const _stock = require("../services/stock.service");
var restify = require("restify");

let middleware = [
  restify.plugins.queryParser(),
  restify.plugins.bodyParser({
    mapParams: true,
  }),
];

const StockController = {
  quote: (server, messengers) => {
    server.post("/api/v1/stock/quote", ...middleware, (req, res, next) => {
      try {
        _stock.quote(req, res, next);
      } catch (err) {
        console.error("/api/v1/stock/quote error: " + err);
      }
    });
  },
  summary: (server, messengers) => {
    server.get(
      "/api/v4/stock/:symbol/summary",
      ...middleware,
      (req, res, next) => {
        try {
          _stock.summary(req, res, next);
        } catch (err) {
          console.error("/api/v4/stock/:symbol/summary error: " + err);
        }
      }
    );
  },
  indicators: (server, messengers) => {
    server.get(
      "/api/v4/stock/:symbol/indicators",
      ...middleware,
      (req, res, next) => {
        try {
          _stock.indicators(req, res, next);
        } catch (err) {
          console.error("/api/v4/stock/:symbol/indicators error: " + err);
        }
      }
    );
  },
  news: (server, messengers) => {
    server.get(
      "/api/v5/stock/:symbol/news",
      ...middleware,
      (req, res, next) => {
        try {
          _stock.news(req, res, next);
        } catch (err) {
          console.error("/api/v5/stock/:symbol/news error: " + err);
        }
      }
    );
  },
  symbol: (server) => {
    server.get("/api/v2/stock/:symbols", ...middleware, (req, res, next) => {
      try {
        _stock.symbol(req, res, next);
      } catch (err) {
        console.error("/api/v2/stock/:symbols error: " + err);
      }
    });
  },
  recommendations: (server) => {
    server.get("/api/v5/stock/recommendations/:symbol", ...middleware, (req, res, next) => {
      try {
        _stock.recommendations(req, res, next);
      } catch (err) {
        console.error("/api/v2/stock/recommendations/:symbol error: " + err);
      }
    });
  },
  grading: (server) => {
    server.get("/api/v5/stock/grading/:symbol", ...middleware, (req, res, next) => {
      try {
        _stock.grading(req, res, next);
      } catch (err) {
        console.error("/api/v2/stock/grading/:symbol error: " + err);
      }
    });
  },
};

module.exports = StockController;
