const { summary } = require("../services/query.service");
const QueryService = require("../services/query.service");
const StockService = require("../services/stock.service");
const MarketService = require("../services/markets.service");
const ChartService = require("../services/chart.service");
import { forkJoin, Subject } from "rxjs";
import MarketsService from "../services/markets.service";

const ASSET_CLASSES = {
  STOCK: "stock",
  CRYPTO: "crypto",
  CASH: "cash",
};

class Portfolio {
  constructor(id, transactions) {
    this.id = id;
    this.transactions = transactions;
    this.updates = new Subject();
    this.interval;
    this.cache = {};
    this.pages = {
      INDEX: "INDEX",
      PERFORMANCE: "PERFORMANCE",
    };
  }

  get holdings() {
    return this.calcHoldings();
  }

  /**
   * TODO: Comment here
   */
  calcHoldings() {
    if (!this.transactions || this.transactions.length === 0) {
      return [];
    }
    const uniqueAssets = [...new Set(this.transactions.map((t) => t.symbol))];
    const holdings = uniqueAssets.map((ua) => {
      return {
        symbol: ua,
        shares: this.transactions
          .filter(
            (t) => t.symbol === ua && (t.owned > 0 || t.owned === undefined)
          )
          .map((t) => (t.owned ? +t.owned : +t.quantity))
          .reduce((acc, curr) => acc + curr, 0),
        class: this.transactions.filter((t) => t.symbol === ua)[0].class
          ? this.transactions.filter((t) => t.symbol === ua)[0].class
          : "stock",
      };
    });

    return holdings;
  }

  get value() {
    return this.calcValue();
  }

  /**
   * TODO: Comment here.
   */
  calcValue() {
    let value = 0;
    const calls = [];

    this.holdings.forEach((h, i) => {
      switch (h.class) {
        case ASSET_CLASSES.CRYPTO:
          calls.push(QueryService.getSummary(`${h.symbol}-USD`));
          break;
        case ASSET_CLASSES.CASH:
          break; // Do nothing.
        case ASSET_CLASSES.STOCK:
        default:
          calls.push(QueryService.getSummary(h.symbol));
      }
    });

    return new Promise((resolve, reject) => {
      forkJoin(calls).subscribe((summaries) => {
        summaries.forEach((summary) => {
          if (summary && summary.price) {
            const h = this.holdings.find((h) => {
              if (summary.quoteType.quoteType === "CRYPTOCURRENCY") {
                return (
                  h.symbol.toUpperCase().trim() ===
                  summary.summaryDetail.fromCurrency.toUpperCase().trim()
                );
              } else {
                return (
                  h.symbol.toUpperCase().trim() ===
                  summary.price.symbol.toUpperCase().trim()
                );
              }
            });
            value += summary.price.regularMarketPrice.raw * h.shares;
          }
        });

        // TODO: Add cash value.
        resolve(value);
      });
    });
  }

  /**
   * TODO: Comment here.
   */
  calcBreakdown() {
    let breakdownArr = [];
    const symbols = [];

    // Gather requests for stock quotes.
    this.holdings.forEach((h) => {
      if (h.class === ASSET_CLASSES.CRYPTO) {
        symbols.push(`${h.symbol}-USD`);
      } else if (h.class === ASSET_CLASSES.STOCK) {
        symbols.push(h.symbol);
      } else if (h.class === ASSET_CLASSES.CASH) {
        if (breakdownArr.find((b) => b.name === h.symbol)) {
          breakdownArr.find((b) => b.name === h.symbol).value += +h.shares;
        } else {
          breakdownArr.push({ name: h.symbol, value: h.shares });
        }
      }
    });

    return new Promise((resolve, reject) => {
      StockService.getQoute(symbols).then((data) => {
        data.quoteResponse.result.forEach((res) => {
          const holding = this.holdings.find((h) => {
            if (res.quoteType === "CRYPTOCURRENCY") {
              return (
                h.symbol.toUpperCase().trim() ===
                res.fromCurrency.toUpperCase().trim()
              );
            } else {
              return (
                h.symbol.toUpperCase().trim() ===
                res.symbol.toUpperCase().trim()
              );
            }
          });
          breakdownArr.push({
            name: holding.symbol,
            value: +holding.shares * res.regularMarketPrice,
          });
        });
        resolve(breakdownArr);
      });
    });
  }

  calcMovers(range, interval) {
    let moversArr = [];
    let calls = [];
    let symbols = [];

    if (range === "1d") {
      // Gather requests for stock quotes.
      this.holdings.forEach((h) => {
        if (h.class === ASSET_CLASSES.CRYPTO) {
          symbols.push(`${h.symbol}-USD`);
        } else if (h.class === ASSET_CLASSES.STOCK) {
          symbols.push(h.symbol);
        }
      });

      return new Promise((resolve, reject) => {
        StockService.getQoute(symbols).then((data) => {
          data.quoteResponse.result.forEach((res) => {
            moversArr.push({
              name: res.symbol,
              value: res.regularMarketChangePercent.toFixed(2),
            });
          });
          resolve(moversArr);
        });
      });
    } else {
      // Gather requests for stock quotes.
      this.holdings.forEach((h) => {
        if (h.class === ASSET_CLASSES.CRYPTO) {
          calls.push(
            ChartService.getChartLL(`${h.symbol}-USD`, interval, range)
          );
        } else if (h.class === ASSET_CLASSES.STOCK) {
          calls.push(ChartService.getChartLL(h.symbol, interval, range));
        }
      });

      return new Promise((resolve, reject) => {
        forkJoin(calls).subscribe((responses) => {
          responses.forEach((res) => {
            if (
              res &&
              res.chart &&
              res.chart.result &&
              res.chart.result.length > 0
            ) {
              const open = res.chart.result[0].indicators.quote[0].open[0];
              const close =
                res.chart.result[0].indicators.quote[0].close[
                  res.chart.result[0].indicators.quote[0].close.length - 1
                ];
              const diff = close - open;
              const val = ((diff / open) * 100).toFixed(2);
              moversArr.push({
                name: res.chart.result[0].meta.symbol,
                value: val,
              });
            }
          });
          resolve(moversArr);
        });
      });
    }
  }

  // Watch portfolio for changes and send updates through the web socket.
  watch(wss, page, context) {
    this.interval = setInterval(
      this.check.bind(this, wss, page, context),
      5000
    );
  }

  // Check for page relavent changes, and send updates through wss.
  check(wss, page, context) {
    let symbols = [];

    if (page === this.pages.INDEX || page === this.pages.PERFORMANCE) {
      // Gather requests for stock quotes.
      this.holdings.forEach((h) => {
        if (h.class === ASSET_CLASSES.CRYPTO) {
          symbols.push(`${h.symbol}-USD`);
        } else if (h.class === ASSET_CLASSES.STOCK) {
          symbols.push(h.symbol);
        }
      });

      StockService.getQoute(symbols).then((data) => {
        data.quoteResponse.result.forEach((res) => {
          let symbol;
          if (res.quoteType === "CRYPTOCURRENCY") {
            symbol = res.fromCurrency.toUpperCase().trim();
          } else {
            symbol = res.symbol.toUpperCase().trim();
          }

          if (this.cache[symbol]) {
            // check for changes
            if (
              res.regularMarketPrice !== this.cache[symbol].regularMarketPrice
            ) {
              // Price update, send new data through wss.
              if (page === this.pages.INDEX) {
                wss.send(
                  JSON.stringify({
                    type: "price update",
                    symbol: symbol,
                    data: res,
                  })
                );
              }

              if (page === this.pages.PERFORMANCE) {
                this.calcBreakdown()
                  .then((breakdown) => {
                    wss.send(
                      JSON.stringify({
                        type: "breakdown update",
                        data: breakdown,
                      })
                    );
                  })
                  .catch((err) => console.log(err));

                this.calcMovers(context.moversRange).then((movers) => {
                  wss.send(
                    JSON.stringify({
                      type: "movers update",
                      data: movers,
                    })
                  );
                });
              }

              // Update the cache.
              this.cache[symbol] = res;
            }
          } else {
            // cache the response
            this.cache[symbol] = res;
          }
        });
      });

      if (page === this.pages.INDEX) {
        // Watch for changes in major indexes.
        MarketsService.getMarketsLL().then((data) => {
          const top3 = data.marketSummaryResponse.result.slice(0, 3);
          top3.forEach((index) => {
            if (this.cache[index.symbol]) {
              // check for changes
              if (
                index.regularMarketPrice.raw !==
                this.cache[index.symbol].regularMarketPrice.raw
              ) {
                // Price update, send new data through wss.
                wss.send(
                  JSON.stringify({
                    type: "market update",
                    symbol: index.symbol,
                    data: index,
                  })
                );

                // Update the cache.
                this.cache[index.symbol] = index;
              }
            } else {
              // cache the response
              this.cache[index.symbol] = index;
            }
          });
        });
      }
    }
  }

  stop() {
    clearInterval(this.interval);
  }
}

module.exports = Portfolio;
