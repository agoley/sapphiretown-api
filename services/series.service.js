const rp = require("request-promise");
const rx = require("rxjs");
const funcs = require("../common/functions");
var unirest = require("unirest");

const ALPHA_ADVANTAGE_API_KEY = process.env.ALPHA_ADVANTAGE_API_KEY;
const X_RAPID_API_HOST = process.env.X_RAPID_API_HOST;
const X_RAPID_API_KEY = process.env.X_RAPID_API_KEY;

const SeriesService = {
  day: (req, res, next) => {
    rp(
      "https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol=" +
        req.body.symbol +
        "&interval=5min&apikey=" +
        ALPHA_ADVANTAGE_API_KEY,
      { json: true }
    ).then(alpha => {
      res.send(alpha);
      return next();
    });
  }
};

module.exports = SeriesService;
