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
const similarCache = new Cache(5000);
const gradingCache = new Cache(5000);
const earningsTrendCache = new Cache(5000);
const quoteModuleCache = new Cache(5000);
const secFilingsCache = new Cache(5000);
const calendarEventsCache = new Cache(5000);

const messengers = require("../common/messenger");

/**
 * @swagger
 * /api/v5/stock/recommendations/{symbol}:
 *   get:
 *     summary: Get quote summary with recommendation trends
 *     tags:
 *       - Analysis
 *     description: Retrieves stock recommendation trends over different time periods.
 *     operationId: getQuoteSummary
 *     parameters:
 *       - name: symbol
 *         in: query
 *         description: Stock symbol to get quote summary for
 *         required: true
 *         type: string
 *         x-example: AAPL
 *       - name: modules
 *         in: query
 *         description: Comma-separated list of modules to include
 *         required: false
 *         type: string
 *         x-example: recommendationTrend
 *     responses:
 *       200:
 *         description: Successful response with quote summary data
 *         schema:
 *           $ref: '#/definitions/QuoteSummaryResponse'
 *         examples:
 *           application/json:
 *             quoteSummary:
 *               result:
 *                 - recommendationTrend:
 *                     trend:
 *                       - period: "0m"
 *                         strongBuy: 7
 *                         buy: 20
 *                         hold: 16
 *                         sell: 2
 *                         strongSell: 1
 *                       - period: "-1m"
 *                         strongBuy: 7
 *                         buy: 23
 *                         hold: 16
 *                         sell: 1
 *                         strongSell: 1
 *                       - period: "-2m"
 *                         strongBuy: 7
 *                         buy: 21
 *                         hold: 14
 *                         sell: 2
 *                         strongSell: 1
 *                       - period: "-3m"
 *                         strongBuy: 7
 *                         buy: 21
 *                         hold: 13
 *                         sell: 2
 *                         strongSell: 2
 *                     maxAge: 86400
 *               error: null
 *       400:
 *         description: Bad request - invalid parameters
 *         schema:
 *           $ref: '#/definitions/ErrorResponse'
 *       404:
 *         description: Stock symbol not found
 *         schema:
 *           $ref: '#/definitions/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         schema:
 *           $ref: '#/definitions/ErrorResponse'
 *
 * definitions:
 *   QuoteSummaryResponse:
 *     type: object
 *     required:
 *       - quoteSummary
 *     properties:
 *       quoteSummary:
 *         $ref: '#/definitions/QuoteSummary'
 *
 *   QuoteSummary:
 *     type: object
 *     required:
 *       - result
 *       - error
 *     properties:
 *       result:
 *         type: array
 *         description: Array of quote summary results
 *         items:
 *           $ref: '#/definitions/QuoteSummaryResult'
 *       error:
 *         type: string
 *         x-nullable: true
 *         description: Error message if request failed, null if successful
 *
 *   QuoteSummaryResult:
 *     type: object
 *     properties:
 *       recommendationTrend:
 *         $ref: '#/definitions/RecommendationTrend'
 *
 *   RecommendationTrend:
 *     type: object
 *     required:
 *       - trend
 *       - maxAge
 *     properties:
 *       trend:
 *         type: array
 *         description: Array of recommendation trends for different time periods
 *         items:
 *           $ref: '#/definitions/TrendPeriod'
 *       maxAge:
 *         type: integer
 *         description: Maximum age of the data in seconds
 *         example: 86400
 *
 *   TrendPeriod:
 *     type: object
 *     required:
 *       - period
 *       - strongBuy
 *       - buy
 *       - hold
 *       - sell
 *       - strongSell
 *     properties:
 *       period:
 *         type: string
 *         description: Time period relative to current date
 *         enum: ["0m", "-1m", "-2m", "-3m"]
 *         example: "0m"
 *       strongBuy:
 *         type: integer
 *         minimum: 0
 *         description: Number of strong buy recommendations
 *         example: 7
 *       buy:
 *         type: integer
 *         minimum: 0
 *         description: Number of buy recommendations
 *         example: 20
 *       hold:
 *         type: integer
 *         minimum: 0
 *         description: Number of hold recommendations
 *         example: 16
 *       sell:
 *         type: integer
 *         minimum: 0
 *         description: Number of sell recommendations
 *         example: 2
 *       strongSell:
 *         type: integer
 *         minimum: 0
 *         description: Number of strong sell recommendations
 *         example: 1
 *
 *   ErrorResponse:
 *     type: object
 *     required:
 *       - error
 *       - message
 *     properties:
 *       error:
 *         type: string
 *         description: Error type
 *         example: "BAD_REQUEST"
 *       message:
 *         type: string
 *         description: Human-readable error message
 *         example: "Invalid stock symbol provided"
 *       code:
 *         type: integer
 *         description: HTTP status code
 *         example: 400
 */

/**
 * @swagger
 * /api/v5/stock/grading/{symbol}:
 *   get:
 *     summary: Get stock upgrade/downgrade history
 *     tags:
 *       - Analysis
 *     description: Retrieves analyst upgrade/downgrade history including grades, and firms.
 *     parameters:
 *       - name: symbol
 *         in: query
 *         description: Stock symbol to get upgrade/downgrade history for
 *         required: true
 *         type: string
 *         x-example: AAPL
 *     responses:
 *       200:
 *         description: Successful response with upgrade/downgrade history data
 *         schema:
 *           $ref: '#/definitions/QuoteSummaryResponse'
 *         examples:
 *           application/json:
 *             quoteSummary:
 *               result:
 *                 - upgradeDowngradeHistory:
 *                     history:
 *                       - epochGradeDate: 1747405777
 *                         firm: "Wedbush"
 *                         toGrade: "Outperform"
 *                         fromGrade: "Outperform"
 *                         action: "reit"
 *                         priceTargetAction: "Maintains"
 *                         currentPriceTarget: 270
 *                       - epochGradeDate: 1746200616
 *                         firm: "Wedbush"
 *                         toGrade: "Outperform"
 *                         fromGrade: "Outperform"
 *                         action: "main"
 *                         priceTargetAction: "Raises"
 *                         currentPriceTarget: 270
 *                       - epochGradeDate: 1746186867
 *                         firm: "Rosenblatt"
 *                         toGrade: "Neutral"
 *                         fromGrade: "Buy"
 *                         action: "down"
 *                         priceTargetAction: "Lowers"
 *                         currentPriceTarget: 217
 *                     maxAge: 86400
 *               error: null
 *       400:
 *         description: Bad request - invalid parameters
 *         schema:
 *           $ref: '#/definitions/ErrorResponse'
 *       404:
 *         description: Stock symbol not found
 *         schema:
 *           $ref: '#/definitions/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         schema:
 *           $ref: '#/definitions/ErrorResponse'
 *
 * definitions:
 *   QuoteSummaryResponse:
 *     type: object
 *     required:
 *       - quoteSummary
 *     properties:
 *       quoteSummary:
 *         $ref: '#/definitions/QuoteSummary'
 *
 *   QuoteSummary:
 *     type: object
 *     required:
 *       - result
 *       - error
 *     properties:
 *       result:
 *         type: array
 *         description: Array of quote summary results
 *         items:
 *           $ref: '#/definitions/QuoteSummaryResult'
 *       error:
 *         type: string
 *         x-nullable: true
 *         description: Error message if request failed, null if successful
 *
 *   QuoteSummaryResult:
 *     type: object
 *     properties:
 *       upgradeDowngradeHistory:
 *         $ref: '#/definitions/UpgradeDowngradeHistory'
 *
 *   UpgradeDowngradeHistory:
 *     type: object
 *     required:
 *       - history
 *       - maxAge
 *     properties:
 *       history:
 *         type: array
 *         description: Array of analyst upgrade/downgrade events
 *         items:
 *           $ref: '#/definitions/UpgradeDowngradeRecord'
 *       maxAge:
 *         type: integer
 *         description: Maximum age of the data in seconds
 *         example: 86400
 *
 *   UpgradeDowngradeRecord:
 *     type: object
 *     required:
 *       - epochGradeDate
 *       - firm
 *       - toGrade
 *       - fromGrade
 *       - action
 *       - priceTargetAction
 *       - currentPriceTarget
 *     properties:
 *       epochGradeDate:
 *         type: integer
 *         description: Unix timestamp of the grade event
 *         example: 1747405777
 *       firm:
 *         type: string
 *         description: Analyst firm issuing the rating
 *         example: "Wedbush"
 *       toGrade:
 *         type: string
 *         description: Grade assigned in this update
 *         example: "Outperform"
 *       fromGrade:
 *         type: string
 *         description: Previous grade before this update
 *         example: "Neutral"
 *       action:
 *         type: string
 *         description: Type of rating action (e.g., up, down, main, reit)
 *         enum: ["up", "down", "main", "reit"]
 *         example: "reit"
 *       priceTargetAction:
 *         type: string
 *         description: Description of price target adjustment
 *         example: "Maintains"
 *       currentPriceTarget:
 *         type: number
 *         format: float
 *         description: Analyst's current price target
 *         example: 270
 *
 *   ErrorResponse:
 *     type: object
 *     required:
 *       - error
 *       - message
 *     properties:
 *       error:
 *         type: string
 *         description: Error type
 *         example: "BAD_REQUEST"
 *       message:
 *         type: string
 *         description: Human-readable error message
 *         example: "Invalid stock symbol provided"
 *       code:
 *         type: integer
 *         description: HTTP status code
 *         example: 400
 */

/**
 * @swagger
 * /api/v5/stock/earningsTrend/{symbol}:
 *   get:
 *     summary: Get earnings trend
 *     tags:
 *       - Analysis
 *     description: Returns quarterly and yearly earnings trend data.
 *     responses:
 *       200:
 *         description: Earnings trend retrieved successfully
 *         schema:
 *           $ref: '#/definitions/EarningsTrendResponse'
 */

/**
 * @swagger
 * definitions:
 *   EarningsTrendResponse:
 *     type: object
 *     properties:
 *       quoteSummary:
 *         type: object
 *         properties:
 *           result:
 *             type: array
 *             items:
 *               $ref: '#/definitions/EarningsTrendResult'
 *           error:
 *             type: object
 *             nullable: true
 *
 *   EarningsTrendResult:
 *     type: object
 *     properties:
 *       earningsTrend:
 *         type: object
 *         properties:
 *           trend:
 *             type: array
 *             items:
 *               $ref: '#/definitions/TrendItem'
 *           maxAge:
 *             type: integer
 *
 *   TrendItem:
 *     type: object
 *     properties:
 *       maxAge:
 *         type: integer
 *       period:
 *         type: string
 *       endDate:
 *         type: string
 *         format: date
 *       growth:
 *         $ref: '#/definitions/Growth'
 *       earningsEstimate:
 *         $ref: '#/definitions/EarningsEstimate'
 *       revenueEstimate:
 *         $ref: '#/definitions/RevenueEstimate'
 *       epsTrend:
 *         $ref: '#/definitions/EPSTrend'
 *       epsRevisions:
 *         $ref: '#/definitions/EPSRevisions'
 *
 *   Growth:
 *     type: object
 *     properties:
 *       raw:
 *         type: number
 *         format: float
 *       fmt:
 *         type: string
 *
 *   EarningsEstimate:
 *     type: object
 *     properties:
 *       avg:
 *         $ref: '#/definitions/Value'
 *       low:
 *         $ref: '#/definitions/Value'
 *       high:
 *         $ref: '#/definitions/Value'
 *       yearAgoEps:
 *         $ref: '#/definitions/Value'
 *       numberOfAnalysts:
 *         $ref: '#/definitions/AnalystCount'
 *       growth:
 *         $ref: '#/definitions/Growth'
 *       earningsCurrency:
 *         type: string
 *
 *   RevenueEstimate:
 *     type: object
 *     properties:
 *       avg:
 *         $ref: '#/definitions/ValueLong'
 *       low:
 *         $ref: '#/definitions/ValueLong'
 *       high:
 *         $ref: '#/definitions/ValueLong'
 *       numberOfAnalysts:
 *         $ref: '#/definitions/AnalystCount'
 *       yearAgoRevenue:
 *         $ref: '#/definitions/ValueLong'
 *       growth:
 *         $ref: '#/definitions/Growth'
 *       revenueCurrency:
 *         type: string
 *
 *   EPSTrend:
 *     type: object
 *     properties:
 *       current:
 *         $ref: '#/definitions/Value'
 *       7daysAgo:
 *         $ref: '#/definitions/Value'
 *       30daysAgo:
 *         $ref: '#/definitions/Value'
 *       60daysAgo:
 *         $ref: '#/definitions/Value'
 *       90daysAgo:
 *         $ref: '#/definitions/Value'
 *       epsTrendCurrency:
 *         type: string
 *
 *   EPSRevisions:
 *     type: object
 *     properties:
 *       upLast7days:
 *         $ref: '#/definitions/AnalystCount'
 *       upLast30days:
 *         $ref: '#/definitions/AnalystCount'
 *       downLast7Days:
 *         $ref: '#/definitions/AnalystCount'
 *       downLast30days:
 *         $ref: '#/definitions/AnalystCount'
 *
 *   Value:
 *     type: object
 *     properties:
 *       raw:
 *         type: number
 *       fmt:
 *         type: string
 *
 *   ValueLong:
 *     type: object
 *     properties:
 *       raw:
 *         type: integer
 *       fmt:
 *         type: string
 *       longFmt:
 *         type: string
 *
 *   AnalystCount:
 *     type: object
 *     properties:
 *       raw:
 *         type: integer
 *       fmt:
 *         type: string
 */

/**
 * @swagger
 * /api/v5/stock/similar/{symbol}:
 *   get:
 *     summary: Get recommended symbols for a given symbol
 *     tags:
 *       - Analysis
 *     description: Returns a list of recommended financial symbols based on a specified symbol.
 *     responses:
 *       200:
 *         description: Recommended symbols retrieved successfully
 *         schema:
 *           $ref: '#/definitions/RecommendationsResponse'
 */

/**
 * @swagger
 * definitions:
 *   RecommendationsResponse:
 *     type: object
 *     properties:
 *       finance:
 *         type: object
 *         properties:
 *           error:
 *             type: object
 *             nullable: true
 *           result:
 *             type: array
 *             items:
 *               $ref: '#/definitions/RecommendationResult'

 *   RecommendationResult:
 *     type: object
 *     properties:
 *       symbol:
 *         type: string
 *       recommendedSymbols:
 *         type: array
 *         items:
 *           $ref: '#/definitions/RecommendedSymbol'

 *   RecommendedSymbol:
 *     type: object
 *     properties:
 *       score:
 *         type: number
 *         format: float
 *       symbol:
 *         type: string
 */

/**
 * @swagger
 * /api/v5/stock/calendarEvents/{symbol}:
 *   get:
 *     summary: Get calendar events for a given financial symbol
 *     tags:
 *       - Analysis
 *     description: Returns earnings and dividend dates for a specified symbol.
 *     responses:
 *       200:
 *         description: Calendar events retrieved successfully
 *         schema:
 *           $ref: '#/definitions/QuoteSummaryResponse'
 */

/**
 * @swagger
 * definitions:
 *   QuoteSummaryResponse:
 *     type: object
 *     properties:
 *       quoteSummary:
 *         type: object
 *         properties:
 *           result:
 *             type: array
 *             items:
 *               $ref: '#/definitions/QuoteSummaryResult'
 *           error:
 *             type: object
 *             nullable: true

 *   QuoteSummaryResult:
 *     type: object
 *     properties:
 *       calendarEvents:
 *         $ref: '#/definitions/CalendarEvents'

 *   CalendarEvents:
 *     type: object
 *     properties:
 *       maxAge:
 *         type: integer
 *       earnings:
 *         $ref: '#/definitions/Earnings'
 *       exDividendDate:
 *         $ref: '#/definitions/DateFormatted'
 *       dividendDate:
 *         $ref: '#/definitions/DateFormatted'

 *   Earnings:
 *     type: object
 *     properties:
 *       earningsDate:
 *         type: array
 *         items:
 *           $ref: '#/definitions/DateFormatted'
 *       earningsCallDate:
 *         type: array
 *         items:
 *           $ref: '#/definitions/DateFormatted'
 *       isEarningsDateEstimate:
 *         type: boolean
 *       earningsAverage:
 *         $ref: '#/definitions/ValueFormatted'
 *       earningsLow:
 *         $ref: '#/definitions/ValueFormatted'
 *       earningsHigh:
 *         $ref: '#/definitions/ValueFormatted'
 *       revenueAverage:
 *         $ref: '#/definitions/ValueFormattedLong'
 *       revenueLow:
 *         $ref: '#/definitions/ValueFormattedLong'
 *       revenueHigh:
 *         $ref: '#/definitions/ValueFormattedLong'

 *   DateFormatted:
 *     type: object
 *     properties:
 *       raw:
 *         type: integer
 *         format: int64
 *       fmt:
 *         type: string

 *   ValueFormatted:
 *     type: object
 *     properties:
 *       raw:
 *         type: number
 *         format: float
 *       fmt:
 *         type: string

 *   ValueFormattedLong:
 *     allOf:
 *       - $ref: '#/definitions/ValueFormatted'
 *       - type: object
 *         properties:
 *           longFmt:
 *             type: string
 */

/**
 * @swagger
 * /api/v5/stock/secFilings/{symbol}:
 *   get:
 *     summary: Get SEC filings for a specific company
 *     tags:
 *       - Analysis
 *     responses:
 *       200:
 *         description: A list of recent SEC filings
 *         schema:
 *           type: object
 *           properties:
 *             quoteSummary:
 *               type: object
 *               properties:
 *                 result:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       secFilings:
 *                         type: object
 *                         properties:
 *                           filings:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 date:
 *                                   type: string
 *                                   format: date
 *                                   example: "2025-05-02"
 *                                 epochDate:
 *                                   type: integer
 *                                   example: 1746144000
 *                                 type:
 *                                   type: string
 *                                   example: "10-Q"
 *                                 title:
 *                                   type: string
 *                                   example: "Periodic Financial Reports"
 *                                 edgarUrl:
 *                                   type: string
 *                                   format: uri
 *                                   example: "https://finance.yahoo.com/sec-filing/AAPL/0000320193-25-000057_320193"
 *                                 exhibits:
 *                                   type: array
 *                                   items:
 *                                     type: object
 *                                     properties:
 *                                       type:
 *                                         type: string
 *                                         example: "EX-31.1"
 *                                       url:
 *                                         type: string
 *                                         format: uri
 *                                         example: "https://cdn.yahoofinance.com/prod/sec-filings/0000320193/000032019325000057/a10-qexhibit31103292025.htm"
 *                                       downloadUrl:
 *                                         type: string
 *                                         format: uri
 *                                         example: "https://finance.yahoo.com/_getSECFilingReportUrl?reportUrl=/sec-filings/0000320193/000032019325000057/Financial_Report.xlsx"
 *                                 maxAge:
 *                                   type: integer
 *                                   example: 1
 *                           maxAge:
 *                             type: integer
 *                             example: 86400
 *                 error:
 *                   type: object
 *                   nullable: true
 *                   example: null
 */



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

const getSecFilings = (symbol) => {
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
    modules: "secFilings",
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

const getCalendarEvents = (symbol) => {
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
    modules: "calendarEvents",
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

const getSimilar = (symbol) => {
  var uni = unirest(
    "GET",
    "https://" +
      _RAPID_API_HOST_YAHOO_FINANCE_LOW_LATENCY +
      "/v6/finance/recommendationsbysymbol/" +
      symbol
  );

  let params = {
    lang: "en",
    region: "US",
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
  secFilings: (req, res, next, count) => {
    if (secFilingsCache.get(JSON.stringify(req.params.symbol))) {
      res.send(secFilingsCache.get(JSON.stringify(req.params.symbol)));
      return next();
    }

    getSecFilings(req.params.symbol)
      .then((data) => {
        if (data.err) {
          console.error(data.err);
          res.send(data);
          return next();
        }
        secFilingsCache.save(JSON.stringify(req.params.symbol), data);
        res.send(data);
        return next();
      })
      .catch((err) => {
        count = count ? count + 1 : 1;
        if (count < 5) {
          // Wait 500ms and retry.
          setTimeout(() => {
            StockService.secFilings(req, res, next, count);
          }, 500);
        } else {
          res.send(data);
          return next();
        }
      });
  },
  calendarEvents: (req, res, next, count) => {
    if (calendarEventsCache.get(JSON.stringify(req.params.symbol))) {
      res.send(calendarEventsCache.get(JSON.stringify(req.params.symbol)));
      return next();
    }

    getCalendarEvents(req.params.symbol)
      .then((data) => {
        if (data.err) {
          console.error(data.err);
          res.send(data);
          return next();
        }
        calendarEventsCache.save(JSON.stringify(req.params.symbol), data);
        res.send(data);
        return next();
      })
      .catch((err) => {
        count = count ? count + 1 : 1;
        if (count < 5) {
          // Wait 500ms and retry.
          setTimeout(() => {
            StockService.calendarEvents(req, res, next, count);
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
  similar: (req, res, next, count) => {
    if (similarCache.get(JSON.stringify(req.params.symbol))) {
      res.send(similarCache.get(JSON.stringify(req.params.symbol)));
      return next();
    }

    getSimilar(req.params.symbol)
      .then((data) => {
        if (data.err) {
          console.error(data.err);
          res.send(data);
          return next();
        }
        similarCache.save(JSON.stringify(req.params.symbol), data);
        res.send(data);
        return next();
      })
      .catch((err) => {
        count = count ? count + 1 : 1;
        if (count < 5) {
          // Wait 500ms and retry.
          setTimeout(() => {
            StockService.similar(req, res, next, count);
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
