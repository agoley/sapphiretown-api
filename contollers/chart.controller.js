const _chart = require('../services/chart.service');

const ChartController = {
    series: (server) => {
      server.post("/api/v1/chart", (req, res, next) => { _chart.day(req, res, next) });
    }
}

module.exports = ChartController;

