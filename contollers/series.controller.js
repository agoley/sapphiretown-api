const _series = require('../services/series.service');

const SeriesController = {
    series: (server) => {
      server.post("/api/v1/series", (req, res, next) => { _series.day(req, res, next) });
    }
}

module.exports = SeriesController;

