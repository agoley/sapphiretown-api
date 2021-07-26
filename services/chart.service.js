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

  const YAHOO_FINANCE_BASE =
  process.env.YAHOO_FINANCE_BASE;
const YAHOO_FINANCE_API_KEY =
  process.env.YAHOO_FINANCE_API_KEY;

const dayCache = new Cache(5000);
const chartCache = new Cache(5000);
const chartCacheLL = new Cache(5000);

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
    "x-api-key": X_RAPID_API_KEY,
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
    "x-api-key": X_RAPID_API_KEY,
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
  chartLL: (req, res, next, count) => {
    const cacheKey = JSON.stringify(req.body).replace(/\s+/g, "");

    if (!req.body.bypass && chartCacheLL.get(cacheKey)) {
      res.send(chartCacheLL.get(cacheKey));
      return next();
    }

    getChartLL(req.body.symbol, req.body.interval, req.body.range)
      .then((data) => {
        chartCacheLL.save(cacheKey, data);
        res.send(data);
        return next();
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
  getChartLL: getChartLL,
};

module.exports = ChartService;
