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
      try {
        _query.query(req, res, next);
      } catch (err) {
        console.error("/api/v1/query error: " + err);
      }
    });
  },
  insights: (server) => {
    server.post("/api/v1/insights", ...middleware, (req, res, next) => {
      try {
        _query.insights(req, res, next);
      } catch (err) {
        console.error("/api/v1/insights error: " + err);
      }
    });
  },
  summary: (server) => {
    server.post("/api/v1/summary", ...middleware, (req, res, next) => {
      try {
        _query.summary(req, res, next);
      } catch (err) {
        console.error("/api/v1/summary error: " + err);
      }
    });
  },
};

module.exports = QueryController;
