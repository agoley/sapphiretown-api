const _intraday = require('../services/intraday.service');

const IntradayController = {
    query: (server) => {
      server.post("/api/v1/query", (req, res, next) => { _intraday.query(req, res, next) });
    }
}

module.exports = IntradayController;

