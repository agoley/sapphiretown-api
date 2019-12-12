var unirest = require("unirest");
const Cache = require("../common/cache");

const X_RAPID_API_HOST = process.env.X_RAPID_API_HOST;
const X_RAPID_API_KEY = process.env.X_RAPID_API_KEY;

var chartCache = new Cache();

const ChartService = {
  day: (req, res, next, count) => {

    const cacheKey = JSON.stringify(req.body).replace(/\s+/g, '');

    if (chartCache.get(cacheKey)) {
      res.send(chartCache.get(cacheKey));
      return next();
    }

    var uni = unirest(
      "GET",
      "https://" + X_RAPID_API_HOST + "/market/get-charts"
    );

    uni.query({
      region: "US",
      lang: "en",
      symbol: req.body.symbol,
      interval: req.body.interval,
      range: req.body.range
    });

    uni.headers({
      "x-rapidapi-host": X_RAPID_API_HOST,
      "x-rapidapi-key": X_RAPID_API_KEY
    });

    uni.end(function(yahoo) {
      if (res.error) throw new Error(res.error);
      count = count ? count + 1 : 1;
      if (yahoo.status !== 200 && count < 5) {
        setTimeout(() => {
          ChartService.day(req, res, next, count);
        }, 5000);
      } else {
        chartCache.save(cacheKey, yahoo.body);
        res.send(yahoo.body);
        return next();
      }
    });
  }
};

module.exports = ChartService;
