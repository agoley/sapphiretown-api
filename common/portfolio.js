const { summary } = require("../services/query.service");
const QueryService = require("../services/query.service");
import { forkJoin } from "rxjs";

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
      calls.push(QueryService.getSummary(h.symbol));
    });

    return new Promise((resolve, reject) => {
      forkJoin(calls).subscribe((summaries) => {
        summaries.forEach((summary) => {
          if (summary && summary.price) {
            const h = this.holdings.find(
              (h) =>
                h.symbol.toUpperCase().trim() ===
                summary.price.symbol.toUpperCase().trim()
            );
            value += summary.price.regularMarketPrice.raw * h.shares;
          }
        });
        resolve(value);
      });
    });
  }
}

module.exports = Portfolio;
