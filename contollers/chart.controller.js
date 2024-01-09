const _chart = require("../services/chart.service");
var restify = require("restify");

let middleware = [
  restify.plugins.queryParser(),
  restify.plugins.bodyParser({
    mapParams: true,
  }),
];

const ChartController = {
  series: (server) => {
    server.post("/api/v1/chart", ...middleware, (req, res, next) => {
      _chart.day(req, res, next);
    });
  },
  chart: (server) => {
    server.post("/api/v2/chart", ...middleware, (req, res, next) => {
      _chart.chart(req, res, next);
    });
  },
  chartLL: (server) => {
    server.post("/api/v2/chartLL", ...middleware, (req, res, next) => {
      _chart.chartLL(req, res, next);
    });
  },
  chartLLV3: (server) => {
    server.post("/api/v3/chartLL", ...middleware, (req, res, next) => {
      _chart.chartLLV3(req, res, next);
    });
  },
};

module.exports = ChartController;
