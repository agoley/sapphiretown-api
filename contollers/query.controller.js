const _query = require("../services/query.service");
var restify = require("restify");

let middleware = [
  restify.plugins.queryParser(),
  restify.plugins.bodyParser({
    mapParams: true,
  }),
];

const QueryController = {
  query: (server) => {
    server.post("/api/v1/query", ...middleware, (req, res, next) => {
      _query.query(req, res, next);
    });
  },
  query: (server) => {
    server.post("/api/v2/query/:symbol", ...middleware, (req, res, next) => {
      _query.symbol(req, res, next);
    });
  },
  insights: (server) => {
    server.post("/api/v1/insights", ...middleware, (req, res, next) => {
      _query.insights(req, res, next);
    });
  },
  summary: (server) => {
    server.post("/api/v1/summary", ...middleware, (req, res, next) => {
      _query.summary(req, res, next);
    });
  },
};

module.exports = QueryController;
