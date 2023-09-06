var unirest = require("unirest");
const Cache = require("../common/cache");

const _RAPID_API_HOST_YAHOO_FINANCE_LOW_LATENCY =
  process.env.X_RAPID_API_HOST_YAHOO_FINANCE_LOW_LATENCY;
const _RAPID_API_KEY_YAHOO_FINANCE_LOW_LATENCY =
  process.env.X_RAPID_API_KEY_YAHOO_FINANCE_LOW_LATENCY;

const quoteCache = new Cache(5000);
const indicatorCache = new Cache(null, true);

const messengers = require("../common/messenger");

const getQuote = (symbols) => {
  if (!symbols.length) {
    return Promise.reject({ error: { message: "Invalid params" } });
  }

  var uni = unirest(
    "GET",
    "https://" + _RAPID_API_HOST_YAHOO_FINANCE_LOW_LATENCY + "/v6/finance/quote"
  );

  uni.query({
    symbols: symbols.join(","),
  });

  uni.headers({
    "x-api-key": _RAPID_API_KEY_YAHOO_FINANCE_LOW_LATENCY,
    useQueryString: true,
  });

  return new Promise((resolve, reject) => {
    let tag = messengers.yahooLowLatency.load(uni.send());
    messengers.yahooLowLatency.responses.subscribe({
      next: (v) => {
        if (v.id === tag) {
          resolve(v.data);
        }
      },
    });
  });
};

const getIndicators = (symbol, specification) => {
  var uni = unirest(
    "GET",
    "https://" +
      _RAPID_API_HOST_YAHOO_FINANCE_LOW_LATENCY +
      "/v8/finance/chart/" +
      symbol
  );

  let params = {
    range: "3mo",
    interval: "1d",
    events: "div,split",
  };

  uni.query(params);

  uni.headers({
    "x-api-key": _RAPID_API_KEY_YAHOO_FINANCE_LOW_LATENCY,
    useQueryString: true,
  });

  return new Promise((resolve, reject) => {
    let tag = messengers.yahooLowLatency.load(uni.send());
    messengers.yahooLowLatency.responses.subscribe({
      next: (v) => {
        if (v.id === tag) {
          const currPrice = v.data?.chart?.result[0]?.meta?.regularMarketPrice;
          if (!currPrice) {
            resolve({
              error: {
                message:
                  "Failed to calculate indicators (can not find current price)",
              },
            });
          }
          const highs = v.data?.chart?.result[0]?.indicators.quote[0]?.high;
          if (!highs || highs.length || highs.length <= 21) {
            resolve({
              error: {
                message: `Failed to calculate indicators, can not find history for (${symbol})`,
              },
            });
          }

          const twentyOneDayHigh = Math.max(...highs?.slice(highs.length - 21));
          const fiftyFiveDayHigh = Math.max(...highs?.slice(highs.length - 55));

          const i = {
            indicators: {
              at21DayHigh: currPrice >= twentyOneDayHigh,
              at55DayHigh: currPrice >= fiftyFiveDayHigh,
            },
          };

          resolve(i);
        }
      },
    });
  });
};

const StockService = {
  /**
   * @swagger
   * /api/v2/stock/{symbols}:
   *  get:
   *    summary: Queries for market data for symbol.
   *    consumes:
   *      - application/json
   *    parameters:
   *     - in: path
   *       name: symbols
   *       description: Symbols of the desired equities to query for.
   *       required: true
   *       schema:
   *         type: string
   *         example: "AAPL,MSFT"
   *    responses:
   *      '200':
   *        description: Market data for the symbols.
   */
  symbol: (req, res, next, count) => {
    if (!req.params.symbols) {
      res.send({
        error: {
          message: "Invalid params",
        },
      });
      return next();
    } else {
      if (quoteCache.get(JSON.stringify(req.params.symbols))) {
        res.send(quoteCache.get(JSON.stringify(req.params.symbols)));
        return next();
      }

      getQuote(req.params.symbols.split(","))
        .then((data) => {
          if (data.err) {
            console.error(data.err);
            res.send(data);
            return next();
          }
          quoteCache.save(JSON.stringify(req.params.symbols), data);
          res.send(data);
          return next();
        })
        .catch((err) => {
          count = count ? count + 1 : 1;
          if (count < 5) {
            // Wait 1s and retry.
            setTimeout(() => {
              StockService.query(req, res, next, count);
            }, 1000);
          } else {
            res.send(data);
            return next();
          }
        });
    }
  },
  quote: (req, res, next, count) => {
    if (quoteCache.get(JSON.stringify(req.body.symbols))) {
      res.send(quoteCache.get(JSON.stringify(req.body.symbols)));
      return next();
    }

    getQuote(req.body.symbols)
      .then((data) => {
        if (data.err) {
          console.error(data.err);
          res.send(data);
          return next();
        }
        quoteCache.save(JSON.stringify(req.body.symbols), data);
        res.send(data);
        return next();
      })
      .catch((err) => {
        count = count ? count + 1 : 1;
        if (count < 5) {
          // Wait 1s and retry.
          setTimeout(() => {
            StockService.query(req, res, next, count);
          }, 1000);
        } else {
          res.send(data);
          return next();
        }
      });
  },
  /**
   * @swagger
   * /api/v4/stock/{symbol}/indicators:
   *  get:
   *    summary: Gets indicators for an equity.
   *    consumes:
   *      - application/json
   *    parameters:
   *     - in: path
   *       name: symbol
   *       description: Symbol of the desired equity to get indicators.
   *       required: true
   *       schema:
   *         type: string
   *         example: "AAPL"
   *    responses:
   *      '200':
   *        description: Indicators for the equity.
   */
  indicators: (req, res, next, count) => {
    getIndicators(req.params.symbol)
      .then((data) => {
        if (data.err) {
          console.error(data.err);
          res.send(data);
          return next();
        }
        res.send(data);
        return next();
      })
      .catch((err) => {
        count = count ? count + 1 : 1;
        if (count < 5) {
          // Wait 1s and retry.
          setTimeout(() => {
            StockService.indicators(req, res, next, count);
          }, 1000);
        } else {
          res.send(data);
          return next();
        }
      });
  },
  getQuote: getQuote,
  getIndicators: getIndicators,
};

module.exports = StockService;
