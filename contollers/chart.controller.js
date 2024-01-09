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
      try {
        _chart.day(req, res, next);
      } catch (err) {
        console.error("/api/v1/chart error: " + err);
      }
    });
  },
  chart: (server) => {
    server.post("/api/v2/chart", ...middleware, (req, res, next) => {
      try {
        _chart.chart(req, res, next);
      } catch (err) {
        console.error("/api/v2/chart error: " + err);
      }
    });
  },
  chartLL: (server) => {
    server.post("/api/v2/chartLL", ...middleware, (req, res, next) => {
      try {
        _chart.chartLL(req, res, next);
      } catch (err) {
        console.error("/api/v2/chartLL error: " + err);
      }
    });
  },
  chartLLV3: (server) => {
    server.post("/api/v3/chartLL", ...middleware, (req, res, next) => {
      try {
        _chart.chartLLV3(req, res, next);
      } catch (err) {
        console.error("/api/v3/chartLL error: " + err);
      }
    });
  },
  chartLLV4: (server) => {
    server.post("/api/v4/chartLL", ...middleware, (req, res, next) => {
      try {
        _chart.chartLLV4(req, res, next);
      } catch (err) {
        console.error("/api/v4/chartLL error: " + err);
      }
    });
  },
};

module.exports = ChartController;
