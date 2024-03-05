const { interval } = require("rxjs");
var unirest = require("unirest");
const Cache = require("../common/cache");
const messengers = require("../common/messenger");

const X_RAPID_API_HOST = process.env.X_RAPID_API_HOST;
const X_RAPID_API_KEY = process.env.X_RAPID_API_KEY;

const _RAPID_API_HOST_YAHOO_FINANCE_LOW_LATENCY =
  process.env.X_RAPID_API_HOST_YAHOO_FINANCE_LOW_LATENCY;
const _RAPID_API_KEY_YAHOO_FINANCE_LOW_LATENCY =
  process.env.X_RAPID_API_KEY_YAHOO_FINANCE_LOW_LATENCY;

const dayCache = new Cache(5000);
const chartCache = new Cache(5000);
const chartCacheLL = new Cache(5000);
const chartCacheLLV2 = new Cache(5000);

const getChartLL = (symbol, interval, range) => {
  var uni = unirest(
    "GET",
    "https://" +
      _RAPID_API_HOST_YAHOO_FINANCE_LOW_LATENCY +
      "/v8/finance/chart/" +
      symbol
  );

  let params = {
    range: range,
    events: "div,split",
  };
  if (interval) {
    params.interval = interval;
  }

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
          resolve(v.data);
        }
      },
    });
  });
};

const getChartLLV3 = (symbol, interval, range, comparisons) => {
  var uni = unirest(
    "GET",
    "https://" +
      _RAPID_API_HOST_YAHOO_FINANCE_LOW_LATENCY +
      "/v8/finance/chart/" +
      symbol
  );

  let params = {
    range: range,
    events: "div,split",
  };

  if (interval) {
    params.interval = interval;
  }
  if (comparisons) {
    params.comparisons = comparisons.join(",");
  }

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
          resolve(v.data);
        }
      },
    });
  });
};

const getChartLLV4 = (
  symbol,
  period1,
  period2,
  range,
  interval,
  comparisons
) => {
  var uni = unirest(
    "GET",
    "https://" +
      _RAPID_API_HOST_YAHOO_FINANCE_LOW_LATENCY +
      "/v8/finance/chart/" +
      symbol
  );

  let params = {
    // range: range,
    interval: interval,
    events: "div,split",
  };

  if (period1) {
    params.period1 = period1;
  }

  if (period2) {
    params.period2 = period2;
  }
  if (comparisons) {
    params.comparisons = comparisons.join(",");
  }

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
          resolve(v.data);
        }
      },
    });
  });
};

/**
 * Get chart data for a symbol.
 * @param {*} symbol
 * @param {*} interval
 * @param {*} range
 * @param {*} start
 * @param {*} end
 */
const getChart = (symbol, interval, range, start, end) => {
  // Create the request object.
  var uni = unirest(
    "GET",
    "https://" + X_RAPID_API_HOST + "/stock/v2/get-chart"
  );

  // Init the request body.
  const body = {
    region: "US",
    lang: "en",
    symbol: symbol,
    interval: interval,
  };

  // Conditionally fill in the range parameters.
  if (start && end) {
    body.period1 = start;
    body.period2 = end;
  } else {
    body.range = range;
  }

  // Apply the request body.
  uni.query(body);

  // Set the request headers.
  uni.headers({
    "x-rapidapi-host": X_RAPID_API_HOST,
    "x-rapidapi-key": X_RAPID_API_KEY,
  });

  // Return a promise for the request.
  return new Promise((resolve, reject) => {
    // Load the request into the messenger queue and note the tag.
    let tag = messengers.yahoo.load(uni.send());
    // Subscribe to the messenger responses.
    messengers.yahoo.responses.subscribe({
      next: (v) => {
        if (v.id === tag) {
          // Resolve with the response data.
          resolve(v.data);
        }
      },
    });
  });
};

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

    if (dayCache.get(cacheKey)) {
      res.send(dayCache.get(cacheKey));
      return next();
    }

    getDay(req.body.symbol, req.body.interval, req.body.range)
      .then((data) => {
        if (data.err) {
          console.error(data.err);
          res.send(data);
          return next();
        }
        dayCache.save(cacheKey, data);
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
  chart: (req, res, next, count) => {
    const cacheKey = JSON.stringify(req.body).replace(/\s+/g, "");

    if (chartCache.get(cacheKey)) {
      res.send(chartCache.get(cacheKey));
      return next();
    }

    getChart(
      req.body.symbol,
      req.body.interval,
      req.body.range,
      req.body.start,
      req.body.end
    )
      .then((data) => {
        if (data.err) {
          console.error(data.err);
          res.send(data);
          return next();
        }
        chartCache.save(cacheKey, data);
        res.send(data);
        return next();
      })
      .catch((err) => {
        count = count ? count + 1 : 1;
        if (count < 5) {
          // Wait 1s and retry.
          setTimeout(() => {
            ChartService.chart(req, res, next, count);
          }, 1000);
        } else {
          res.send(data);
          return next();
        }
      });
  },
  /**
   * @swagger
   * /api/v2/chartLL:
   *  post:
   *    summary: Gets price action for an equity.
   *    consumes:
   *      - application/json
   *    parameters:
   *     - in: body
   *       schema:
   *         type: object
   *         required:
   *            - range
   *         properties:
   *           range:
   *             type: string
   *             description: "`1d` `5d` `1mo` `3mo` `6mo` `1y` `5y` `10y` `max` `ytd`"
   *             example: "1d"
   *           interval:
   *             type: string
   *             description: "`1m` `5m` `15m` `1d` `1wk` `1mo`"
   *             example: "5m"
   *           symbol:
   *             type: string
   *             description: Symbol to retrieve action for.
   *             example: "AAPL"
   *    responses:
   *      '200':
   *        description: Price action for the symbol.
   *
   */
  chartLL: (req, res, next, count) => {
    if (!req.body.symbol || !req.body.range || !req.body.interval) {
      res.send({
        error: {
          message: "Invalid params",
        },
      });
      return next();
    }

    const cacheKey = JSON.stringify(req.body).replace(/\s+/g, "");

    if (!req.body.bypass && chartCacheLL.get(cacheKey)) {
      res.send(chartCacheLL.get(cacheKey));
      return next();
    }

    getChartLL(req.body.symbol, req.body.interval, req.body.range)
      .then((data) => {
        if (data.err) {
          console.error(data.err);
          res.send(data);
          return next();
        } else {
          chartCacheLL.save(cacheKey, data);
          res.send(data);
          return next();
        }
      })
      .catch((err) => {
        count = count ? count + 1 : 1;
        if (count < 5) {
          // Wait 1s and retry.
          setTimeout(() => {
            ChartService.chartLL(req, res, next, count);
          }, 1000);
        } else {
          res.send(data);
          return next();
        }
      });
  },
  chartLLV3: (req, res, next, count) => {
    if (!req.body.symbol || !req.body.range || !req.body.interval) {
      res.send({
        error: {
          message: "Invalid params",
        },
      });
      return next();
    }

    const cacheKey = JSON.stringify(req.body).replace(/\s+/g, "");

    if (!req.body.bypass && chartCacheLLV2.get(cacheKey)) {
      res.send(chartCacheLLV2.get(cacheKey));
      return next();
    }
    /**
     * @swagger
     * /api/v3/chartLL:
     *  post:
     *    summary: Gets price action for an equity.
     *    consumes:
     *      - application/json
     *    parameters:
     *     - in: body
     *       schema:
     *         type: object
     *         required:
     *            - range
     *         properties:
     *           range:
     *             type: string
     *             description: "`1d` `5d` `1mo` `3mo` `6mo` `1y` `5y` `10y` `max` `ytd`"
     *             example: "1d"
     *           interval:
     *             type: string
     *             description: "`1m` `5m` `15m` `1d` `1wk` `1mo`"
     *             example: "5m"
     *           symbol:
     *             type: string
     *             description: Symbol to retrieve action for.
     *             example: "AAPL"
     *           comparisons:
     *             type: array
     *             description: Symbols to get comparison chart data
     *             example: "MSFT,AMZN"
     *    responses:
     *      '200':
     *        description: Price action for the symbol.
     *
     */
    getChartLLV3(
      req.body.symbol,
      req.body.interval,
      req.body.range,
      req.body.comparisons
    )
      .then((data) => {
        if (data.err) {
          console.error(data.err);
          res.send(data);
          return next();
        } else {
          chartCacheLLV2.save(cacheKey, data);
          res.send(data);
          return next();
        }
      })
      .catch((err) => {
        count = count ? count + 1 : 1;
        if (count < 5) {
          // Wait 1s and retry.
          setTimeout(() => {
            ChartService.chartLLV3(req, res, next, count);
          }, 1000);
        } else {
          res.send(data);
          return next();
        }
      });
  },
  chartLLV4: (req, res, next, count) => {
    if (!req.body.symbol || !req.body.range || !req.body.interval || !req.body.period1 || !req.body.period2) {
      res.send({
        error: {
          message: "Invalid params",
        },
      });
      return next();
    }

    const cacheKey = JSON.stringify(req.body).replace(/\s+/g, "");

    if (!req.body.bypass && chartCacheLLV2.get(cacheKey)) {
      res.send(chartCacheLLV2.get(cacheKey));
      return next();
    }
    /**
     * @swagger
     * /api/v4/chartLL:
     *  post:
     *    summary: Gets price action for an equity.
     *    consumes:
     *      - application/json
     *    parameters:
     *     - in: body
     *       schema:
     *         type: object
     *         required:
     *            - range
     *         properties:
     *           range:
     *             type: string
     *             description: "`1d` `5d` `1mo` `3mo` `6mo` `1y` `5y` `10y` `max` `ytd`"
     *             example: "1d"
     *           period1:
     *             type: date
     *             description: start date
     *           period2:
     *             type: date
     *             description: end date
     *           symbol:
     *             type: string
     *             description: Symbol to retrieve action for.
     *             example: "AAPL"
     *           comparisons:
     *             type: array
     *             description: Symbols to get comparison chart data
     *             example: "MSFT,AMZN"
     *    responses:
     *      '200':
     *        description: Price action for the symbol.
     *
     */
    getChartLLV4(
      req.body.symbol,
      req.body.period1,
      req.body.period2,
      req.body.range,
      req.body.interval,
      req.body.comparisons
    )
      .then((data) => {
        if (data.err) {
          console.error(data.err);
          res.send(data);
          return next();
        } else {
          chartCacheLLV2.save(cacheKey, data);
          res.send(data);
          return next();
        }
      })
      .catch((err) => {
        count = count ? count + 1 : 1;
        if (count < 5) {
          // Wait 1s and retry.
          setTimeout(() => {
            ChartService.chartLLV4(req, res, next, count);
          }, 1000);
        } else {
          res.send(data);
          return next();
        }
      });
  },
  getChartLL: getChartLL,
  getChartLLV3: getChartLLV3,
  getChartLLV4: getChartLLV4,
};

module.exports = ChartService;
