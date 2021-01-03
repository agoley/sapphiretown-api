const _query = require("../services/query.service");

const QueryController = {
  query: (server, messengers) => {
    server.post("/api/v1/query", (req, res, next) => {
      _query.query(req, res, next);
    });
  },
  insights: (server) => {
    server.post("/api/v1/insights", (req, res, next) => {
      _query.insights(req, res, next);
    });
  },
  summary: (server) => {
    server.post("/api/v1/summary", (req, res, next) => {
      _query.summary(req, res, next);
    });
  },
};

module.exports = QueryController;
