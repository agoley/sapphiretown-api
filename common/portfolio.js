const { summary } = require("../services/query.service");
const QueryService = require("../services/query.service");
const StockService = require("../services/stock.service");
const ChartService = require("../services/chart.service");
import { forkJoin, Subject } from "rxjs";

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
  watch(wss, page) {
    this.interval = setInterval(this.check.bind(this, wss, page), 5000);
  }

  // Check for page relavent changes, and send updates through wss.
  check() {
    if (page === this.pages.INDEX) {
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

      StockService.getQoute(symbols).then((data) => {
        data.quoteResponse.result.forEach((res) => {
          if (res.quoteType === "CRYPTOCURRENCY") {
            const symbol = res.fromCurrency.toUpperCase().trim();
            if (this.cache[symbol]) {
              // check for changes
            } else {
              // cache the response.
              this.cache[symbol] = res;
            }
          } else {
            const symbol = res.symbol.toUpperCase().trim();
            if (this.cache[symbol]) {
              // check for changes
              if (
                res.price.regularMarketPrice !==
                this.cache[symbol].price.regularMarketPrice
              ) {
                // Price update, send new data through wss.
                ws.send({ type: "price update", symbol: symbol, data: res });
                // Update the cache.
                this.cache[symbol] = res;
              }
            } else {
              // cache the response
              this.cache[symbol] = res;
            }
          }
        });
      });
    }

    if (page === this.pages.PERFORMANCE) {
    }
  }

  stop() {
    clearInterval(this.interval);
  }
}

module.exports = Portfolio;
