var unirest = require("unirest");
const Cache = require("../common/cache");
const messengers = require("../common/messenger");

const X_RAPID_API_HOST = process.env.X_RAPID_API_HOST;
const X_RAPID_API_KEY = process.env.X_RAPID_API_KEY;

var marketCache = new Cache();

const getMarkets = () => {
  var uni = unirest(
    "GET",
    "https://" + X_RAPID_API_HOST + "/market/get-summary"
  );

  uni.query({
    region: "US",
    lang: "en",
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

const getAutocomplete = (query) => {
  var uni = unirest("GET", "https://" + X_RAPID_API_HOST + "/auto-complete");

  uni.query({
    region: "US",
    q: query,
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

const MarketsService = {
  markets: (req, res, next, count) => {
    if (marketCache.get("summary")) {
      res.send(marketCache.get("summary"));
      return next();
    }

    getMarkets()
      .then((data) => {
        marketCache.save("summary", data);
        res.send(data);
        return next();
      })
      .catch((err) => {
        count = count ? count + 1 : 1;
        if (count < 5) {
          // Wait 1s and retry.
          setTimeout(() => {
            MarketsService.markets(req, res, next, count);
          }, 1000);
        } else {
          res.send(data);
          return next();
        }
      });
  },
  autocomplete: (req, res, next, count) => {
    if (marketCache.get(req.body.query)) {
      res.send(marketCache.get(req.body.query));
      return next();
    }

    getAutocomplete(req.body.query)
      .then((data) => {
        marketCache.save(req.body.query, data);
        res.send(data);
        return next();
      })
      .catch((err) => {
        count = count ? count + 1 : 1;
        if (count < 5) {
          // Wait 1s and retry.
          setTimeout(() => {
            MarketsService.autocomplete(req, res, next, count);
          }, 1000);
        } else {
          res.send(data);
          return next();
        }
      });
  },
};

module.exports = MarketsService;
