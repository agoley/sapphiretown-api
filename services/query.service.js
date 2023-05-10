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
  /**
   * @swagger
   * /api/v2/query/{symbol}:
   *  get:
   *    summary: Queries for market data for symbol.
   *    consumes:
   *      - application/json
   *    parameters:
   *     - in: path
   *       name: symbol
   *       description: Symbol of the desired equity to query for.
   *       required: true
   *       schema:
   *         type: string
   *         example: "AAPL"
   *    responses:
   *      '200':
   *        description: Market data for the symbol.
   */
  symbol: (req, res, next, count) => {
    if (!req.params.symbol) {
      res.send({
        error: {
          message: "Invalid params",
        },
      });
      return next();
    } else {
      if (queryCache.get(req.params.symbol)) {
        res.send(queryCache.get(req.params.symbol));
      }

      getQuery(req.params.symbol)
        .then((data) => {
          if (data.err) {
            console.error(data.err);
            res.send(data);
          }
          queryCache.save(req.params.symbol, data);
          res.send(data);
        })
        .catch((err) => {
          count = count ? count + 1 : 1;
          if (count < 5) {
            // Wait 1s and retry.
            setTimeout(() => {
              QueryService.query(req, res, next, count);
            }, 1000);
          } else {
            res.send(err);
          }
        });
    }
  },
  query: (req, res, next, count) => {
    if (queryCache.get(req.body.symbol)) {
      res.send(queryCache.get(req.body.symbol));
    }

    getQuery(req.body.symbol)
      .then((data) => {
        if (data.err) {
          console.error(data.err);
          res.send(data);
        }
        queryCache.save(req.body.symbol, data);
        res.send(data);
      })
      .catch((err) => {
        count = count ? count + 1 : 1;
        if (count < 5) {
          // Wait 1s and retry.
          setTimeout(() => {
            QueryService.query(req, res, next, count);
          }, 1000);
        } else {
          res.send(err);
        }
      });
  },
  insights: (req, res, next, count) => {
    if (insightsCache.get(req.body.symbol)) {
      res.send(insightsCache.get(req.body.symbol));
    }

    getInsights(req.body.symbol)
      .then((data) => {
        if (data.err) {
          console.error(data.err);
          res.send(data);
        }
        summaryCache.save(req.body.symbol, data);
        res.send(data);
      })
      .catch((err) => {
        count = count ? count + 1 : 1;
        if (count < 5) {
          // Wait 1s and retry.
          setTimeout(() => {
            QueryService.insights(req, res, next, count);
          }, 1000);
        } else {
          res.send(err);
        }
      });
  },
  summary: (req, res, next, count) => {
    if (summaryCache.get(req.body.symbol)) {
      res.send(summaryCache.get(req.body.symbol));
    }

    getSummary(req.body.symbol)
      .then((data) => {
        if (data.err) {
          console.error(data.err);
          res.send(data);
        }
        summaryCache.save(req.body.symbol, data);
        res.send(data);
      })
      .catch((err) => {
        count = count ? count + 1 : 1;
        if (count < 5) {
          // Wait 1s and retry.
          setTimeout(() => {
            QueryService.summary(req, res, next, count);
          }, 1000);
        } else {
          res.send(err);
        }
      });
  },
  getInsights: getInsights,
  getSummary: getSummary,
};

module.exports = QueryService;
