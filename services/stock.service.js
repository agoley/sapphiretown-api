var unirest = require("unirest");
const Cache = require("../common/cache");

const _RAPID_API_HOST_YAHOO_FINANCE_LOW_LATENCY =
  process.env.X_RAPID_API_HOST_YAHOO_FINANCE_LOW_LATENCY;
const _RAPID_API_KEY_YAHOO_FINANCE_LOW_LATENCY =
  process.env.X_RAPID_API_KEY_YAHOO_FINANCE_LOW_LATENCY;

const quoteCache = new Cache(5000);
const messengers = require("../common/messenger");

const getQoute = (symbols) => {
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

const StockService = {
  quote: (req, res, next, count) => {
    if (quoteCache.get(JSON.stringify(req.body.symbol))) {
      res.send(quoteCache.get(JSON.stringify(req.body.symbol)));
      return next();
    }

    getQoute(req.body.symbols)
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
  getQoute: getQoute,
};

module.exports = StockService;
