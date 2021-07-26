var unirest = require("unirest");
const Cache = require("../common/cache");

const X_RAPID_API_HOST = process.env.X_RAPID_API_HOST;
const X_RAPID_API_KEY = process.env.X_RAPID_API_KEY;

const queryCache = new Cache(5000);
const insightsCache = new Cache();
const summaryCache = new Cache(5000);

const messengers = require("../common/messenger");

const getQuery = (symbol) => {
  var uni = unirest("GET", "https://" + X_RAPID_API_HOST + "/stock/get-detail");

  uni.query({
    region: "US",
    lang: "en",
    symbol: symbol,
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

const getInsights = (symbol) => {
  var uni = unirest(
    "GET",
    "https://" + X_RAPID_API_HOST + "/stock/v2/get-insights"
  );

  uni.query({
    symbol: symbol,
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

const getSummary = (symbol) => {
  var uni = unirest(
    "GET",
    "https://" + X_RAPID_API_HOST + "/stock/v2/get-summary"
  );

  uni.query({
    symbol: symbol,
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

const QueryService = {
  query: (req, res, next, count) => {
    if (queryCache.get(req.body.symbol)) {
      res.send(queryCache.get(req.body.symbol));
      return next();
    }

    getQuery(req.body.symbol)
      .then((data) => {
        queryCache.save(req.body.symbol, data);
        res.send(data);
        return next();
      })
      .catch((err) => {
        count = count ? count + 1 : 1;
        if (count < 5) {
          // Wait 1s and retry.
          setTimeout(() => {
            QueryService.query(req, res, next, count);
          }, 1000);
        } else {
          res.send(data);
          return next();
        }
      });
  },
  insights: (req, res, next, count) => {
    if (insightsCache.get(req.body.symbol)) {
      res.send(insightsCache.get(req.body.symbol));
      return next();
    }

    getInsights(req.body.symbol)
      .then((data) => {
        summaryCache.save(req.body.symbol, data);
        res.send(data);
        return next();
      })
      .catch((err) => {
        count = count ? count + 1 : 1;
        if (count < 5) {
          // Wait 1s and retry.
          setTimeout(() => {
            QueryService.insights(req, res, next, count);
          }, 1000);
        } else {
          res.send(data);
          return next();
        }
      });
  },
  summary: (req, res, next, count) => {
    if (summaryCache.get(req.body.symbol)) {
      res.send(summaryCache.get(req.body.symbol));
      return next();
    }

    getSummary(req.body.symbol)
      .then((data) => {
        summaryCache.save(req.body.symbol, data);
        res.send(data);
        return next();
      })
      .catch((err) => {
        count = count ? count + 1 : 1;
        if (count < 5) {
          // Wait 1s and retry.
          setTimeout(() => {
            QueryService.summary(req, res, next, count);
          }, 1000);
        } else {
          res.send(data);
          return next();
        }
      });
  },
  getInsights: getInsights,
  getSummary: getSummary,
};

module.exports = QueryService;
