var unirest = require("unirest");
const Cache = require("../common/cache");

const X_RAPID_API_HOST = process.env.X_RAPID_API_HOST;
const X_RAPID_API_KEY = process.env.X_RAPID_API_KEY;

var marketCache = new Cache();

const MarketsService = {
  markets: (req, res, next, count) => {
    if (marketCache.get("get-summary")) {
      res.send(marketCache.get("get-summary"));
      return next();
    }

    var uni = unirest(
      "GET",
      "https://" + X_RAPID_API_HOST + "/market/get-summary"
    );

    uni.query({
      region: "US",
      lang: "en"
    });

    uni.headers({
      "x-rapidapi-host": X_RAPID_API_HOST,
      "x-rapidapi-key": X_RAPID_API_KEY
    });

    uni.end(function(yahoo) {
      if (res.error) throw new Error(res.error);
      if (yahoo.status !== 200 && count < 5) {
        setTimeout(() => {
          MarketsService.markets(req, res, next, count);
        }, 5000);
      } else {
        marketCache.save("get-summary", yahoo.body);
        res.send(yahoo.body);
        return next();
      }
    });
  },
  autocomplete: (req, res, next, count) => {
    if (marketCache.get(req.body.query)) {
      res.send(marketCache.get(req.body.query));
      return next();
    }

    var uni = unirest(
      "GET",
      "https://" + X_RAPID_API_HOST + "/market/auto-complete"
    );

    uni.query({
      region: "US",
      lang: "en",
      query: req.body.query
    });

    uni.headers({
      "x-rapidapi-host": X_RAPID_API_HOST,
      "x-rapidapi-key": X_RAPID_API_KEY
    });

    uni.end(function(yahoo) {
      if (res.error) throw new Error(res.error);
      if (yahoo.status !== 200 && count < 5) {
        setTimeout(() => {
          MarketsService.autocomplete(req, res, next, count);
        }, 5000);
      } else {
        marketCache.save(req.body.query, yahoo.body);
        res.send(yahoo.body);
        return next();
      }
    });
  }
};

module.exports = MarketsService;
