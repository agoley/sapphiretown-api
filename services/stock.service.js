var unirest = require("unirest");
const Cache = require("../common/cache");
const cheerio = require("cheerio");

const _RAPID_API_HOST_YAHOO_FINANCE_LOW_LATENCY =
  process.env.X_RAPID_API_HOST_YAHOO_FINANCE_LOW_LATENCY;
const _RAPID_API_KEY_YAHOO_FINANCE_LOW_LATENCY =
  process.env.X_RAPID_API_KEY_YAHOO_FINANCE_LOW_LATENCY;

const quoteCache = new Cache(5000);
const summaryCache = new Cache(5000);
const recommendationCache = new Cache(5000);
const gradingCache = new Cache(5000);
const earningsTrendCache = new Cache(5000);
const quoteModuleCache = new Cache(5000);

const indicatorCache = new Cache(null, true);

const messengers = require("../common/messenger");

function scrapeNews(symbol, exchange) {
  let url = "https://www.google.com/finance/quote/" + symbol;
  if (exchange) {
    url += ":" + exchange;
  }

  let header = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 6.3; Win64; x64)  AppleWebKit/537.36 (KHTML, like Gecko) Chrome/99.0.4844.84 Safari/537.36 Viewer/96.9.4688.89",
  };

  return new Promise((resolve, reject) => {
    unirest
      .get(url)
      .headers(header)
      .then((response) => {
        const $ = cheerio.load(response.body);

        const articles = [...$("div[data-article-source-name]")];

        const result = [];

        articles.forEach((value, index) => {
          const links = [...$(value).find("a")];
          let imgs = [...$(value).find("img")];
          let metas = [...$(value).find("div div a div")];

          let title, publisher, publishedTimeStr;
          if (metas.length === 0) {
            metas = [...$(value).find("a div")];

            publisher = $(metas[2]).text();
            title = $(metas[4]).text();
            publishedTimeStr = $(metas[5]).text();
          } else {
            publisher = $(metas[2]).text();
            title = $(metas[6]).text();
            publishedTimeStr = $(metas[4]).text();
          }

          result.push({
            articleURL: $(links[0]).attr("href"),
            imgURL: imgs[0]?.attribs?.src,
            articleSource: publisher,
            articlePublishedStr: publishedTimeStr,
            title: title,
          });
        });

        resolve(result);
      });
  });
}
// getData();

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

const getNews = (symbol) => {
  return new Promise((resolve, reject) => {
    getQuote([symbol])
      .then((data) => {
        let exchange;
        if (data.quoteResponse.result[0].fullExchangeName === "NasdaqGS") {
          exchange = "NASDAQ";
        } else if (data.quoteResponse.result[0].fullExchangeName === "CCC") {
          exchange = undefined;
        } else {
          exchange = data.quoteResponse.result[0].fullExchangeName;
        }

        scrapeNews(symbol, exchange).then((data) => {
          resolve(data);
        });
      })
      .catch((err) => {
        reject(err);
      });
  });
};

const getQuoteSummary = (symbol) => {
  if (!symbol) {
    return Promise.reject({ error: { message: "Invalid params" } });
  }

  var uni = unirest(
    "GET",
    "https://" +
      _RAPID_API_HOST_YAHOO_FINANCE_LOW_LATENCY +
      "/v11/finance/quoteSummary/" +
      symbol +
      "?modules=summaryDetail,defaultKeyStatistics,assetProfile,fundOwnership,majorDirectHolders,majorHoldersBreakdown,cashflowStatementHistory,secFilings,insiderTransactions,price,quoteType,esgScores,sectorTrend,calendarEvents"
  );

  uni.headers({
    "x-api-key": _RAPID_API_KEY_YAHOO_FINANCE_LOW_LATENCY,
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

          try {
            const twentyOneDayHigh = Math.max(
              ...highs?.slice(highs.length - 21)
            );
            const fiftyFiveDayHigh = Math.max(
              ...highs?.slice(highs.length - 55)
            );

            const i = {
              indicators: {
                at21DayHigh: currPrice >= twentyOneDayHigh,
                at55DayHigh: currPrice >= fiftyFiveDayHigh,
              },
            };

            resolve(i);
          } catch (err) {
            resolve({
              error: {
                message: `Failed to calculate indicators, can not find history for (${symbol})`,
              },
            });
          }
        }
      },
    });
  });
};

const getRecommendations = (symbol) => {
  var uni = unirest(
    "GET",
    "https://" +
      _RAPID_API_HOST_YAHOO_FINANCE_LOW_LATENCY +
      "/v11/finance/quoteSummary/" +
      symbol
  );

  let params = {
    lang: "en",
    region: "US",
    modules: "recommendationTrend",
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
          resolve(v);
        }
      },
    });
  });
};

const getGrading = (symbol) => {
  var uni = unirest(
    "GET",
    "https://" +
      _RAPID_API_HOST_YAHOO_FINANCE_LOW_LATENCY +
      "/v11/finance/quoteSummary/" +
      symbol
  );

  let params = {
    lang: "en",
    region: "US",
    modules: "upgradeDowngradeHistory",
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
          resolve(v);
        }
      },
    });
  });
};

const getEarningsTrend = (symbol) => {
  var uni = unirest(
    "GET",
    "https://" +
      _RAPID_API_HOST_YAHOO_FINANCE_LOW_LATENCY +
      "/v11/finance/quoteSummary/" +
      symbol
  );

  let params = {
    lang: "en",
    region: "US",
    modules: "earningsTrend",
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
          resolve(v);
        }
      },
    });
  });
};

const getQuoteModule = (symbol, module) => {
  var uni = unirest(
    "GET",
    "https://" +
      _RAPID_API_HOST_YAHOO_FINANCE_LOW_LATENCY +
      "/v11/finance/quoteSummary/" +
      symbol
  );

  let params = {
    lang: "en",
    region: "US",
    modules: module,
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
          resolve(v);
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
            StockService.quote(req, res, next, count);
          }, 1000);
        } else {
          res.send(err);
          return next();
        }
      });
  },
  /**
   * @swagger
   * /api/v4/stock/{symbol}/news:
   *  get:
   *    summary: Gets news for an equity.
   *    consumes:
   *      - application/json
   *    parameters:
   *     - in: path
   *       name: symbol
   *       description: Symbol of the desired equity to get news.
   *       required: true
   *       schema:
   *         type: string
   *         example: "AAPL"
   *    responses:
   *      '200':
   *        description: News for the equity.
   */
  news: (req, res, next, count) => {
    getNews(req.params.symbol)
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
            StockService.news(req, res, next, count);
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
  summary: (req, res, next, count) => {
    if (summaryCache.get(JSON.stringify(req.params.symbol))) {
      res.send(summaryCache.get(JSON.stringify(req.params.symbol)));
      return next();
    }

    getQuoteSummary(req.params.symbol)
      .then((data) => {
        if (data.err) {
          console.error(data.err);
          res.send(data);
          return next();
        }
        summaryCache.save(JSON.stringify(req.params.symbol), data);
        res.send(data);
        return next();
      })
      .catch((err) => {
        count = count ? count + 1 : 1;
        if (count < 5) {
          // Wait 1s and retry.
          setTimeout(() => {
            StockService.summary(req, res, next, count);
          }, 1000);
        } else {
          res.send(data);
          return next();
        }
      });
  },
  recommendations: (req, res, next, count) => {
    if (recommendationCache.get(JSON.stringify(req.params.symbol))) {
      res.send(recommendationCache.get(JSON.stringify(req.params.symbol)));
      return next();
    }

    getRecommendations(req.params.symbol)
      .then((data) => {
        if (data.err) {
          console.error(data.err);
          res.send(data);
          return next();
        }
        recommendationCache.save(JSON.stringify(req.params.symbol), data);
        res.send(data);
        return next();
      })
      .catch((err) => {
        count = count ? count + 1 : 1;
        if (count < 5) {
          // Wait 500ms and retry.
          setTimeout(() => {
            StockService.recommendations(req, res, next, count);
          }, 500);
        } else {
          res.send(data);
          return next();
        }
      });
  },
  grading: (req, res, next, count) => {
    if (gradingCache.get(JSON.stringify(req.params.symbol))) {
      res.send(gradingCache.get(JSON.stringify(req.params.symbol)));
      return next();
    }

    getGrading(req.params.symbol)
      .then((data) => {
        if (data.err) {
          console.error(data.err);
          res.send(data);
          return next();
        }
        gradingCache.save(JSON.stringify(req.params.symbol), data);
        res.send(data);
        return next();
      })
      .catch((err) => {
        count = count ? count + 1 : 1;
        if (count < 5) {
          // Wait 500ms and retry.
          setTimeout(() => {
            StockService.grading(req, res, next, count);
          }, 500);
        } else {
          res.send(data);
          return next();
        }
      });
  },
  earningsTrend: (req, res, next, count) => {
    if (earningsTrendCache.get(JSON.stringify(req.params.symbol))) {
      res.send(earningsTrendCache.get(JSON.stringify(req.params.symbol)));
      return next();
    }

    getEarningsTrend(req.params.symbol)
      .then((data) => {
        if (data.err) {
          console.error(data.err);
          res.send(data);
          return next();
        }
        earningsTrendCache.save(JSON.stringify(req.params.symbol), data);
        res.send(data);
        return next();
      })
      .catch((err) => {
        count = count ? count + 1 : 1;
        if (count < 5) {
          // Wait 500ms and retry.
          setTimeout(() => {
            StockService.earningsTrend(req, res, next, count);
          }, 500);
        } else {
          res.send(data);
          return next();
        }
      });
  },
  quoteModule: (req, res, next, count) => {
    if (quoteModuleCache.get(`${req.params.symbol}-${req.params.module}`)) {
      res.send(
        quoteModuleCache.get(`${req.params.symbol}-${req.params.module}`)
      );
      return next();
    }

    getQuoteModule(req.params.symbol, req.params.module)
      .then((data) => {
        if (data.err) {
          console.error(data.err);
          res.send(data);
          return next();
        }
        quoteModuleCache.save(
          `${req.params.symbol}-${req.params.module}`,
          data
        );
        res.send(data);
        return next();
      })
      .catch((err) => {
        count = count ? count + 1 : 1;
        if (count < 5) {
          // Wait 500ms and retry.
          setTimeout(() => {
            StockService.quoteModule(req, res, next, count);
          }, 500);
        } else {
          res.send(data);
          return next();
        }
      });
  },
  getQuoteSummary: getQuoteSummary,
  getQuote: getQuote,
  getIndicators: getIndicators,
};

module.exports = StockService;
