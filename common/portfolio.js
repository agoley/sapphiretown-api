const { summary } = require("../services/query.service");
const QueryService = require("../services/query.service");
const StockService = require("../services/stock.service");
import { forkJoin } from "rxjs";

const ASSET_CLASSES = {
  STOCK: "stock",
  CRYPTO: "crypto",
  CASH: "cash",
};

class Portfolio {
  constructor(id, transactions) {
    this.id = id;
    this.transactions = transactions;
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
}

module.exports = Portfolio;
