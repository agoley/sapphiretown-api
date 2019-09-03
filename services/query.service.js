const rp = require("request-promise");
const rx = require("rxjs");
const funcs = require("../common/functions");
var unirest = require("unirest");

const ALPHA_ADVANTAGE_API_KEY = process.env.ALPHA_ADVANTAGE_API_KEY;
const X_RAPID_API_HOST = process.env.X_RAPID_API_HOST;
const X_RAPID_API_KEY = process.env.X_RAPID_API_KEY;

const QueryService = {
  qoute: (req, res, next) => {
    var options = {
      method: "POST",
      uri: "https://" + X_RAPID_API_HOST + "/stock/get-detail",
      headers: {
        "x-rapidapi-host": X_RAPID_API_HOST,
        "x-rapidapi-key": X_RAPID_API_KEY
      },
      body: {
        region: "US",
        lang: "en",
        symbol: req.body.symbol
      },
      json: true
    };

    console.log(options);

    rp(options).then(data => {
      console.log(data);
    });
  },
  query: (req, res, next) => {
    var uni = unirest(
      "GET",
      "https://" + X_RAPID_API_HOST + "/stock/get-detail"
    );

    uni.query({
      region: "US",
      lang: "en",
      symbol: req.body.symbol
    });

    uni.headers({
      "x-rapidapi-host": X_RAPID_API_HOST,
      "x-rapidapi-key": X_RAPID_API_KEY
    });

    uni.end(function(yahoo) {
      if (res.error) throw new Error(res.error);

      res.send(yahoo.body);
      return next();
    });

    // var dayQueryAsObservable = rx.from(
    //   rp(
    //     "https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=" +
    //       req.body.symbol +
    //       "&apikey=" +
    //       ALPHA_ADVANTAGE_API_KEY,
    //     { json: true }
    //   )
    // );

    // dayQueryAsObservable.subscribe(data => {
    //   console.log(funcs.extractChangeFromDailySeries(data));
    // });

    // var intradayQueryAsObservable = rp(
    //   "https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol=" +
    //     req.body.symbol +
    //     "&interval=5min&apikey=" +
    //     ALPHA_ADVANTAGE_API_KEY,
    //   { json: true }
    // );

    // rx.forkJoin([intradayQueryAsObservable, dayQueryAsObservable]).subscribe(
    //   data => {
    //     var payload = {};
    //     payload.price = funcs.extractLastPriceFromSeries(data[0]);
    //     payload.change = funcs.extractChangeFromDailySeries(data[1]);
    //     res.send(payload);
    //     return next();
    //   }
    // );
  }
};

module.exports = QueryService;
