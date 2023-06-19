var unirest = require("unirest");
const Cache = require("../common/cache");

const _RAPID_API_HOST_YAHOO_FINANCE_LOW_LATENCY =
  process.env.X_RAPID_API_HOST_YAHOO_FINANCE_LOW_LATENCY;
const _RAPID_API_KEY_YAHOO_FINANCE_LOW_LATENCY =
  process.env.X_RAPID_API_KEY_YAHOO_FINANCE_LOW_LATENCY;

const quoteCache = new Cache(5000);
const messengers = require("../common/messenger");

const getQuote = (symbols) => {
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

    /**
   * @swagger
   * /api/v1/stock/quote:
   *  get:
   *    summary: Gets a quote for a symbol, containing market data.
   *    consumes:
   *      - application/json
   *    parameters:
   *     - in: path
   *       name: symbol
   *       description: Symbol of the desired equity.
   *       required: true
   *       schema:
   *         type: string
   *         example: "AAPL"
   *    responses:
   *      '200':
   *        description: Market quote data for the symbol.
   */
  quoteV2: (req, res, next, count) => {
    if (quoteCache.get(JSON.stringify(req.params.symbol))) {
      res.send(quoteCache.get(JSON.stringify(req.params.symbol)));
      return next();
    }

    getQuote([req.params.symbol])
      .then((data) => {
        if (data.err) {
          console.error(data.err);
          res.send(data);
          return next();
        }
        quoteCache.save(JSON.stringify(req.params.symbol), data);
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
  getQuote: getQuote,
};

module.exports = StockService;
