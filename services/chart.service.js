var unirest = require("unirest");
const Cache = require("../common/cache");
const messengers = require("../common/messenger");

const X_RAPID_API_HOST = process.env.X_RAPID_API_HOST;
const X_RAPID_API_KEY = process.env.X_RAPID_API_KEY;

const chartCache = new Cache();

const getDay = (symbol, interval, range) => {
  var uni = unirest(
    "GET",
    "https://" + X_RAPID_API_HOST + "/market/get-charts"
  );

  uni.query({
    region: "US",
    lang: "en",
    symbol: symbol,
    interval: interval,
    range: range,
  });

  uni.headers({
    "x-rapidapi-host": X_RAPID_API_HOST,
    "x-rapidapi-key": X_RAPID_API_KEY,
  });

  return new Promise((resolve, reject) => {
    let tag = messengers.yahoo.load(uni.send());
    messengers.yahoo.responses.subscribe({
      next: (v) => {
        if (v.id === tag) {
          resolve(v.data);
        }
      },
    });
  });
};

const ChartService = {
  day: (req, res, next, count) => {
    const cacheKey = JSON.stringify(req.body).replace(/\s+/g, "");

    if (chartCache.get(cacheKey)) {
      res.send(chartCache.get(cacheKey));
      return next();
    }

    getDay(req.body.symbol, req.body.interval, req.body.range)
      .then((data) => {
        chartCache.save(req.body.symbol, data);
        res.send(data);
        return next();
      })
      .catch((err) => {
        count = count ? count + 1 : 1;
        if (count < 5) {
          // Wait 1s and retry.
          setTimeout(() => {
            ChartService.day(req, res, next, count);
          }, 1000);
        } else {
          res.send(data);
          return next();
        }
      });
  },
};

module.exports = ChartService;
