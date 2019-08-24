const _query = require('../services/query.service');

const QueryController = {
    query: (server) => {
      server.post("/api/v1/query", (req, res, next) => { _query.query(req, res, next) });
    }
}

module.exports = QueryController;

