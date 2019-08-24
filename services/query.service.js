const ALPHA_ADVANTAGE_API_KEY = process.env.ALPHA_ADVANTAGE_API_KEY;
const rp = require("request-promise");
const rx = require("rxjs");
const funcs = require("../common/functions");

const QueryService = {
  query: (req, res, next) => {
    var dayQueryAsObservable = rx.from(
      rp(
        "https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=" +
          req.body.symbol +
          "&apikey=" +
          ALPHA_ADVANTAGE_API_KEY,
        { json: true }
      )
    );

    dayQueryAsObservable.subscribe(data => {
      console.log(funcs.extractChangeFromDailySeries(data));
    });

    var intradayQueryAsObservable = rp(
      "https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol=" +
        req.body.symbol +
        "&interval=5min&apikey=" +
        ALPHA_ADVANTAGE_API_KEY,
      { json: true }
    );

    rx.forkJoin([intradayQueryAsObservable, dayQueryAsObservable]).subscribe(
      data => {
        var payload = {};
        payload.price = funcs.extractLastPriceFromSeries(data[0]);
        payload.change = funcs.extractChangeFromDailySeries(data[1]);
        res.send(payload);
        return next();
      }
    );
  }
};

module.exports = QueryService;
