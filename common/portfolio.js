const QueryService = require("../services/query.service");
const StockService = require("../services/stock.service");
const ChartService = require("../services/chart.service");
import { forkJoin, Subject } from "rxjs";
import MarketsService from "../services/markets.service";
import { async } from "rxjs/internal/scheduler/async";
const Cache = require("../common/cache");

const ASSET_CLASSES = {
  STOCK: "stock",
  CRYPTO: "crypto",
  CASH: "cash",
};

const CRYPTO_POSTFIX = "-USD";

const actionCache = new Cache(120000);
const comparisonCache = new Cache(60000);

/**
 * Gets the value of the holding at a point in time
 * @param {*} timestamp
 * @param {*} field field in question (high, low, open, close, volume)
 * @returns {number} the value of the holding in the portfolio at the corresponding time
 */
const getValueAtTime = (timestamp, response, holdingActivityWithinRange) => {
  const index = response.chart.result[0].timestamp.findIndex(
    (ts) => ts === timestamp
  );

  if (index < 0) {
    // There is no activity at this timestamp
    return undefined;
  }

  const closestHoldingBeforeOrAtTime = holdingActivityWithinRange
    .reverse()
    .find(
      (activity) => activity.time <= response.chart.result[0].timestamp[index]
    );

  if (!closestHoldingBeforeOrAtTime) {
    // There is no activity before or at this time, thus no value in the portfolio

    return undefined;
  }

  let action = {
    date: timestamp,
    high:
      closestHoldingBeforeOrAtTime.quantity *
      response.chart.result[0].indicators.quote[0]["high"][index],
    low:
      closestHoldingBeforeOrAtTime.quantity *
      response.chart.result[0].indicators.quote[0]["low"][index],
    open:
      closestHoldingBeforeOrAtTime.quantity *
      response.chart.result[0].indicators.quote[0]["open"][index],
    close:
      closestHoldingBeforeOrAtTime.quantity *
      response.chart.result[0].indicators.quote[0]["close"][index],
    volume:
      closestHoldingBeforeOrAtTime.quantity *
      response.chart.result[0].indicators.quote[0]["volume"][index],
  };

  return action;
};

class Portfolio {
  constructor(id, transactions, portfolio_name) {
    this.id = id;
    this.transactions = transactions;
    this.updates = new Subject();
    this.watchInterval;
    this.cache = {};
    this.pages = {
      INDEX: "INDEX",
      PERFORMANCE: "PERFORMANCE",
      PORTFOLIOS: "PORTFOLIOS",
    };
    this.portfolio_name = portfolio_name;
    this.availableRanges = this.getAvailableRanges();
  }

  get holdings() {
    const holdings = this.calcHoldings();
    return holdings;
  }

  get totalGain() {}

  get realizedGain() {}

  get cash() {}

  findIndexOfOldestShares = (symbol) => {
    const doesTransactionStillHaveOwnedShares = (transaction) => {
      return (
        transaction &&
        transaction.type !== "SALE" &&
        (transaction.owned === undefined || parseInt(transaction.owned, 10) > 0)
      );
    };

    // get the first transaction for this symbol with owned shares still.
    let indexOfOldestShares = this.transactions.findIndex(
      (t, i) => i >= 0 && t.type !== "SALE" && t.symbol === symbol
    );

    while (
      !doesTransactionStillHaveOwnedShares(
        this.transactions[indexOfOldestShares]
      ) &&
      indexOfOldestShares > 0
    ) {
      // Try the next transaction with shares of this symbol.
      indexOfOldestShares = this.transactions.findIndex(
        (t, i) =>
          i > indexOfOldestShares && t.type !== "SALE" && t.symbol === symbol
      );
    }
    return indexOfOldestShares;
  };

  async addTransaction(transaction) {
    const copy = JSON.parse(JSON.stringify(transaction));

    if (copy.type === "SALE") {
      while (+copy.quantity > 0) {
        let indexOfOldestShares = this.findIndexOfOldestShares(copy.symbol);

        if (indexOfOldestShares >= 0) {
          // Subtract the sold shares from the owned shares.
          let t = this.transactions[indexOfOldestShares];
          if (!t.owned) {
            t.owned = +t.quantity;
          }

          if (+t.quantity > +copy.quantity) {
            // set the owned shares.
            t.owned = +t.quantity - +copy.quantity;
            copy.quantity = 0;
          } else {
            // set the owned shares to 0 and decrement quantity.
            t.owned = 0;
            copy.quantity = copy.quantity - t.quantity;
          }
          transaction.history = transaction.history
            ? [...transaction.history, t]
            : [t];
        } else {
          transaction.owned = 0;
          copy.quantity = 0;
        }
      }
    }
    this.transactions.push(transaction);
  }

  calcDailyChange() {
    const symbols = [];
    let startingPriceOnDay = 0;
    let currentPriceOnDay = 0;

    // Gather requests for stock quotes.
    this.holdings.forEach((h) => {
      if (h.class === ASSET_CLASSES.CRYPTO) {
        symbols.push(`${h.symbol + CRYPTO_POSTFIX}`);
      } else if (h.class === ASSET_CLASSES.STOCK) {
        symbols.push(h.symbol);
      }
    });

    return new Promise((resolve, reject) => {
      StockService.getQuote(symbols).then((data) => {
        data.quoteResponse.result.forEach((quote) => {
          const holding = this.holdings.find(
            (h) => h.symbol === quote.symbol || h.symbol === quote.fromCurrency
          );

          startingPriceOnDay +=
            holding.shares * quote.regularMarketPreviousClose;

          currentPriceOnDay += holding.shares * quote.regularMarketPrice;
        });
        const diff = currentPriceOnDay - startingPriceOnDay;
        const percent = (diff / startingPriceOnDay) * 100;

        resolve({
          raw: diff,
          percent: percent,
          start: startingPriceOnDay,
          current: currentPriceOnDay,
        });
      });
    });
  }

  async getRealizedGainOrLoss(today) {
    let gain = 0;

    if (!this.transactions) {
      return gain;
    }

    for (const transaction of this.transactions) {
      if (transaction.type === "SALE") {
        // Get the holding for this symbol.
        const h = await this.getHolding(transaction.symbol, transaction.class);

        // Get sale proceeds - (cost basis * quantity sold).
        const g =
          +transaction.price * +transaction.quantity -
          +h.costBasis * +transaction.quantity;
        gain += g;
      }
    }

    return gain;
  }

  async calcSummary() {
    const symbols = [];
    let startingPriceOnDay = 0;
    let currentPriceOnDay = 0;
    let cashBalance = 0;
    let realizedGainOrLoss = 0;

    // Gather requests for stock quotes.
    this.holdings.forEach((h) => {
      if (h.class === ASSET_CLASSES.CRYPTO) {
        symbols.push(`${h.symbol + CRYPTO_POSTFIX}`);
      } else if (h.class === ASSET_CLASSES.STOCK) {
        symbols.push(h.symbol);
      } else if (h.class === ASSET_CLASSES.CASH) {
        cashBalance += +h.shares;
      }
    });

    const portfolio_name = this.portfolio_name
      ? this.portfolio_name
      : "Unnamed Portfolio";

    if (!this.holdings.length) {
      return Promise.resolve({
        portfolio_name: portfolio_name,
        principal: 0,
        change: {
          raw: 0,
          percent: 0,
        },
        allTimeChange: {
          raw: 0,
          percent: 0,
        },
        regularMarketPreviousClose: 0,
        regularMarketPrice: 0,
        netBalance: 0,
        realizedGainOrLoss: 0,
      });
    }

    let allTimeStart = this.transactions
      .filter((t) => t.class !== "cash")
      .reduce((prev, curr) => {
        return prev + curr.price * curr.quantity;
      }, 0);
    allTimeStart = allTimeStart.toFixed(2);

    return new Promise(async (resolve, reject) => {
      if (symbols.length) {
        StockService.getQuote(symbols).then(async (data) => {
          data.quoteResponse.result.forEach(async (quote) => {
            const holding = this.holdings.find(
              (h) =>
                h.symbol === quote.symbol || h.symbol === quote.fromCurrency
            );

            if (quote.regularMarketPrice) {
              startingPriceOnDay +=
                holding.shares * quote.regularMarketPreviousClose;

              currentPriceOnDay += holding.shares * quote.regularMarketPrice;
            }
          });

          const diff = currentPriceOnDay - startingPriceOnDay;
          const percent = (diff / startingPriceOnDay) * 100;
          const net = currentPriceOnDay + cashBalance;

          const realizedGainOrLoss = await this.getRealizedGainOrLoss(false);

          const summary = {
            portfolio_name: portfolio_name,
            principal: allTimeStart,
            change: {
              raw: diff,
              percent: percent,
            },
            allTimeChange: {
              raw: currentPriceOnDay - allTimeStart,
              percent:
                ((currentPriceOnDay - allTimeStart) / allTimeStart) * 100,
            },
            regularMarketPreviousClose: startingPriceOnDay,
            regularMarketPrice: currentPriceOnDay,
            netBalance: net,
            realizedGainOrLoss: realizedGainOrLoss,
          };

          resolve(summary);
        });
      } else {
        const portfolio_name = this.portfolio_name
          ? this.portfolio_name
          : "Unnamed Portfolio";
        const summary = {
          portfolio_name: portfolio_name,
          principal: 0,
          change: {
            raw: 0,
            percent: 0,
          },
          allTimeChange: {
            raw: 0,
            percent: 0,
          },
          regularMarketPreviousClose: 0,
          regularMarketPrice: 0,
          netBalance: 0,
        };

        resolve(summary);
      }
    });
  }

  get change() {
    return this.calcDailyChange();
  }

  get summary() {
    return this.calcSummary();
  }

  async getHolding(symbol, type) {
    if (!this.transactions || this.transactions.length === 0) {
      return undefined;
    }

    let sharesForSymbol;
    if (type) {
      sharesForSymbol = this.transactions.filter(
        (p) => p.symbol === symbol && +p.owned > 0 && p.class === type
      );
    } else {
      sharesForSymbol = this.transactions.filter(
        (p) => p.symbol === symbol && p.owned > 0
      );
    }

    const cb =
      sharesForSymbol
        .map((t) => t.price * t.quantity)
        .reduce((a, b) => +a + +b, 0) /
      sharesForSymbol.map((t) => t.quantity).reduce((a, b) => +a + +b, 0);

    let holding = {
      symbol: symbol,
      quantity: sharesForSymbol.map((t) => +t.owned).reduce((a, b) => a + b, 0),
      costBasis: cb,
      class: type,
    };

    let market = await StockService.getQuote([symbol]);

    if (!market || !market.quoteResponse || !market.quoteResponse.result[0]) {
      holding.gainOrLoss = undefined;
      return holding;
    }

    let quote = market.quoteResponse.result[0];

    let gOrL = (
      (quote.regularMarketPrice.toFixed(2) - holding.costBasis.toFixed(2)) *
      holding.quantity
    ).toFixed(2);

    holding.gainOrLoss = gOrL;

    return holding;
  }

  /**
   * TODO: Comment here
   */
  calcHoldings() {
    if (!this.transactions || this.transactions.length === 0) {
      return [];
    }

    const uniqueAssets = [...new Set(this.transactions.map((t) => t.symbol))];
    let holdings = uniqueAssets
      .map((ua) => {
        return {
          symbol: ua,
          shares: this.transactions
            .filter(
              (t) =>
                t.symbol === ua &&
                t.type === "PURCHASE" &&
                (t.owned > 0 || t.owned === undefined)
            )
            .map((t) => (t.owned ? +t.owned : +t.quantity))
            .reduce((acc, curr) => acc + curr, 0),
          class: this.transactions.filter((t) => t.symbol === ua)[0].class
            ? this.transactions.filter((t) => t.symbol === ua)[0].class
            : "stock",
        };
      })
      .filter((h) => h.shares > 0);

    return holdings;
  }

  holdingsAtTime(ts, cashFlag) {
    if (!this.transactions || this.transactions.length === 0) {
      return [];
    }

    let transactions = this.transactions.filter((t) => new Date(t.date) <= ts);

    const uniqueAssets = [...new Set(transactions.map((t) => t.symbol))];
    let holdings = uniqueAssets
      .map((ua) => {
        return {
          symbol: ua,
          shares: transactions
            .filter(
              (t) =>
                t.symbol === ua &&
                t.type === "PURCHASE" &&
                (t.owned > 0 || t.owned === undefined)
            )
            .map((t) => (t.owned ? +t.owned : +t.quantity))
            .reduce((acc, curr) => acc + curr, 0),
          class: transactions.filter((t) => t.symbol === ua)[0].class
            ? transactions.filter((t) => t.symbol === ua)[0].class
            : "stock",
        };
      })
      .filter((h) => h.shares > 0);

    if (!cashFlag) {
      holdings = holdings.filter((h) => h.class !== ASSET_CLASSES.CASH);
    }

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
          calls.push(QueryService.getSummary(`${h.symbol + CRYPTO_POSTFIX}`));
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
        symbols.push(`${h.symbol + CRYPTO_POSTFIX}`);
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
      if (symbols.length) {
        StockService.getQuote(symbols).then((data) => {
          if (data && data.quoteResponse && data.quoteResponse.result) {
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
          } else {
            console.error("calcBreakdown: failure to get quotes");
            reject();
          }
          resolve(breakdownArr);
        });
      } else {
        resolve([]);
      }
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
          symbols.push(`${h.symbol + CRYPTO_POSTFIX}`);
        } else if (h.class === ASSET_CLASSES.STOCK) {
          symbols.push(h.symbol);
        }
      });

      return new Promise((resolve, reject) => {
        StockService.getQuote(symbols).then((data) => {
          if (data && data.quoteResponse && data.quoteResponse.result) {
            data.quoteResponse.result.forEach((res) => {
              moversArr.push({
                name: res.symbol,
                value: res.regularMarketChangePercent.toFixed(2),
              });
            });
          } else {
            console.error("calcMovers: failure to fetch data");
            reject();
          }
          resolve(moversArr);
        });
      });
    } else {
      // Gather requests for stock quotes.
      this.holdings.forEach((h) => {
        if (h.class === ASSET_CLASSES.CRYPTO) {
          calls.push(
            ChartService.getChartLL(
              `${h.symbol + CRYPTO_POSTFIX}`,
              interval,
              range
            )
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

  getStartTime(range) {
    let start = new Date();

    switch (range) {
      case "1d":
        start.setHours(0);
        return start.getTime();

      case "5d":
        // Get the first day of the week from current date.
        start.setHours(0);
        var day = start.getDay(),
          diff = start.getDate() - day + (day == 0 ? -6 : 1);
        return new Date(start.setDate(diff)).getTime();
      case "1mo":
        start.setHours(0);
        return new Date(start.getFullYear(), start.getMonth(), 1).getTime();
      case "3mo":
        start.setHours(0);
        start.setMonth(start.getMonth() - 3);
        return start.getTime();
      case "6mo":
        start.setHours(0);
        start.setMonth(start.getMonth() - 6);
        return start.getTime();
      case "1y":
        start.setHours(0);
        start.setFullYear(start.getFullYear() - 1);
        return start.getTime();
      case "5y":
        start.setHours(0);
        start.setFullYear(start.getFullYear() - 5);
        return start.getTime();
      case "10y":
        start.setHours(0);
        start.setFullYear(start.getFullYear() - 10);
        return start.getTime();
      case "ytd":
        start.setHours(0);
        start.setMonth(0);
        start.setDate(0);
        return start.getTime();
      default:
        return 0;
    }
  }

  /**
   * Get the price action of the entire portfolio as a time series.
   * @param {*} range Time range for the time series
   * @param {*} Interval Interval for values in time series
   * @param {boolean} cashFlag If false doesn't include cash in the price.
   */
  // async calcPriceAction(range, interval, cashFlag) {
  //   if (actionCache.get(`${this.id}-${range}-${interval}-${cashFlag}`)) {
  //     return Promise.resolve(
  //       actionCache.get(`${this.id}-${range}-${interval}-${cashFlag}`)
  //     );
  //   }

  //   try {
  //     // Get the portfolios holdings
  //     let holdings = [...this.holdings];

  //     if (!cashFlag) {
  //       holdings = holdings.filter((h) => h.class !== ASSET_CLASSES.CASH);
  //     }

  //     // Maps holdings to respective price action
  //     const holdingHistoryMap = {};

  //     // Loop through each holding and get the price action for the given range.
  //     for (let i = 0; i < holdings.length; i++) {
  //       // The current holding
  //       let holding = holdings[i];

  //       // References the chart api response, and the first timestamp in the chart.
  //       let response, firstTimestamp;

  //       if (holding.class !== ASSET_CLASSES.CASH) {
  //         // The chart information for this symbol.
  //         response = await ChartService.getChartLL(
  //           holding.class === ASSET_CLASSES.STOCK
  //             ? holding.symbol
  //             : `${holding.symbol + CRYPTO_POSTFIX}`,
  //           interval,
  //           range
  //         );

  //         if (!(response && response.chart && response.chart.result[0])) {
  //           // The request failed.
  //           console.error(response);
  //           // Throw an error, to be caught and handled down stream.
  //           throw new Error();
  //         }

  //         // Convert timestamps to ms
  //         response.chart.result[0].timestamp =
  //           response.chart.result[0].timestamp.map((t) => t * 1000);

  //         firstTimestamp = response.chart.result[0].timestamp[0];
  //       }

  //       // Transactions for symbol in this portfolio, these could be of type purchase or sale.
  //       const transactions = this.transactions
  //         .filter((t) => t.symbol === holding.symbol)
  //         .map((t) => ({ ...t, date: new Date(t.date).getTime() }));

  //       // Map of the holdings quantity at different times during range.
  //       const holdingTimeMachineArr = [];

  //       // Accumulator for quantity.
  //       let quantity = 0;

  //       // Record the holdings history at different times during the time range.
  //       // Iterate over the holdings transactions to build this time machine.
  //       for (let i = 0; i < transactions.length; i++) {
  //         // The current transaction for symbol
  //         const transaction = transactions[i];

  //         if (transaction.date >= firstTimestamp) {
  //           // This transaction occurs during the chart time period

  //           if (holdingTimeMachineArr.length === 0) {
  //             // The first transaction for this holding occurs after the start of this chart
  //             // Record 0 as the quantity at the start.

  //             holdingTimeMachineArr.push({
  //               time: firstTimestamp,
  //               quantity: 0,
  //             });
  //           }
  //         }

  //         if (transaction.type === "PURCHASE") {
  //           // This is a purchase add to the current holding quantity

  //           quantity += parseFloat(transaction.quantity);
  //         }

  //         if (transaction.type === "SALE") {
  //           // This is a sale remove to the current holding quantity

  //           quantity -= parseFloat(transaction.quantity);
  //         }

  //         if (transaction.date >= firstTimestamp) {
  //           // This transaction is relevant to the chart range.

  //           // Record the holding quantity at this time.
  //           holdingTimeMachineArr.push({
  //             time: transaction.date,
  //             quantity: quantity,
  //           });
  //         }
  //       }

  //       if (holdingTimeMachineArr.length === 0) {
  //         // No transaction occurs after the range start time.

  //         // Record the quantity at the most recent transaction time
  //         holdingTimeMachineArr.push({
  //           time: transactions[transactions.length - 1].date,
  //           quantity: quantity,
  //         });
  //       }

  //       // The history of value for this holding.
  //       let holdingHistoryArr = [];

  //       if (holding.class !== ASSET_CLASSES.CASH) {
  //         // This is a stock or crypto holding

  //         // Iterate over the charts x axis (time) recording the value at each
  //         response.chart.result[0].timestamp.forEach((t, i) => {
  //           let action = getValueAtTime(t, response, holdingTimeMachineArr);

  //           holdingHistoryArr.push(action);
  //         });
  //       } else {
  //         // This is a cash holding
  //         // Add action using the quantity for all values, as cash is the base currency.
  //         holdingTimeMachineArr.forEach((ac) => {
  //           holdingHistoryArr.push({
  //             date: this.getStartTime(range), // This can screw things up when before start of range!!
  //             high: ac.quantity,
  //             low: ac.quantity,
  //             open: ac.quantity,
  //             close: ac.quantity,
  //             volume: 0,
  //           });
  //         });
  //       }

  //       holdingHistoryMap[holding.symbol] = holdingHistoryArr;
  //     }

  //     // Maps timestamps to a snapshot of the portfolio at that time
  //     const timeSnapshotMap = {};

  //     let symbolsArr = Object.keys(holdingHistoryMap);

  //     // Iterate over all symbols in the portfolio
  //     symbolsArr.forEach((key) => {
  //       // the historical data for this portfolio
  //       const action = holdingHistoryMap[key];

  //       action.forEach((candle) => {
  //         // Get the snapshot for this holding at the time of this action
  //         let snapshot = timeSnapshotMap[candle.date];

  //         if (snapshot) {
  //           // The snapshot exists at this timestamp

  //           // Merge the current candle with the snapshot
  //           snapshot.high += candle.high;
  //           snapshot.close += candle.close;
  //           snapshot.open += candle.open;
  //           snapshot.low += candle.low;
  //           snapshot.volume += candle.volume;
  //           snapshot.breakout.push({ symbol: key, candle: candle });
  //         } else {
  //           // No snapshot exists at this timestamp

  //           // Initialize the snapshot with this candle for this timestamp
  //           snapshot = {
  //             high: candle.high,
  //             close: candle.close,
  //             open: candle.open,
  //             low: candle.low,
  //             volume: candle.volume,
  //             date: candle.date,
  //             breakout: [{ symbol: key, candle: candle }],
  //           };
  //         }
  //         timeSnapshotMap[candle.date] = snapshot;
  //       });
  //     });

  //     // Get all timestamps in the map, convert to numbers, and sort
  //     let timestamps = Object.keys(timeSnapshotMap)
  //       .map((ts) => +ts)
  //       .sort((a, b) => a - b);

  //     // Iterate over all timestamps that have portfolio snapshots
  //     timestamps.forEach((ts, i) => {
  //       // Snapshot for this timestamp
  //       let snapshot = timeSnapshotMap[ts];

  //       // Iterate over all symbols
  //       symbolsArr.forEach((key) => {
  //         if (!snapshot.breakout.map((bo) => bo.symbol).includes(key)) {
  //           // Snapshot doesn't include a value for the current symbol

  //           // Timestamps before the current one, reversed
  //           let timestampsToSearch = timestamps
  //             .slice(0, i - 2)
  //             .reverse()
  //             .slice(0, 1);

  //           // The most recent snapshot that includes this symbol
  //           let recent = timestampsToSearch.find((t) =>
  //             timeSnapshotMap[t].breakout.map((bo) => bo.symbol).includes(key)
  //           );

  //           if (recent) {
  //             // Get the candle for this symbol from the most recent snapshot
  //             let candle = timeSnapshotMap[recent].breakout.find(
  //               (bo) => bo.symbol === key
  //             ).candle;

  //             if (candle.low > 0) {
  //               // This candle holds value

  //               // Use the most recent candle to update the current snapshot values
  //               timeSnapshotMap[ts].high += candle.high;
  //               timeSnapshotMap[ts].close += candle.close;
  //               timeSnapshotMap[ts].open += candle.open;
  //               timeSnapshotMap[ts].low += candle.low;
  //               timeSnapshotMap[ts].volume += candle.volume;
  //               timeSnapshotMap[ts].breakout.push({
  //                 symbol: key,
  //                 candle: candle,
  //               });
  //             }
  //           }
  //         }
  //       });
  //     });

  //     // The snapshots in chronological order
  //     let snapshots = [];

  //     // Iterate over all timestamps in the range
  //     timestamps.forEach((ts) => {
  //       // count indicating how many holdings are represented at this time
  //       let count = 0;

  //       timeSnapshotMap[ts].breakout.forEach((bo) => {
  //         if (bo.candle.open > 0) {
  //           // Increment count for each holding represented in this snapshot
  //           count++;
  //         }
  //       });

  //       if (count === this.holdingsAtTime(ts, cashFlag).length) {
  //         // This snapshot represents all holdings in the portfolio

  //         // Add the snapshot to the array
  //         snapshots.push(timeSnapshotMap[ts]);
  //       }
  //     });

  //     actionCache.save(
  //       `${this.id}-${range}-${interval}-${cashFlag}`,
  //       snapshots
  //     );
  //     return Promise.resolve(snapshots);
  //   } catch (err) {
  //     // An error occurred during processing, resolve a descriptive error

  //     console.log(err);

  //     Promise.resolve({
  //       error: {
  //         stack: "portfolio.getPriceAction",
  //         message: "Something went wrong generating price action",
  //       },
  //     });
  //   }
  // }

  async getTimeMachine(response) {
    if (!(response && response.chart && response.chart.result[0])) {
      // The request failed.
      return Promise.reject({ message: "Failed to get chart for holding" });
    }

    let holding = this.holdings.find((h) => {
      if (h.class === ASSET_CLASSES.CRYPTO) {
        return (
          h.symbol + CRYPTO_POSTFIX === response.chart.result[0].meta.symbol
        );
      }
      return h.symbol === response.chart.result[0].meta.symbol;
    });

    if (!holding) {
      return Promise.reject({
        message: "Failed to get holding from chart response",
      });
    }

    // Convert timestamps to ms
    response.chart.result[0].timestamp = response.chart.result[0].timestamp.map(
      (t) => t * 1000
    );

    let firstTimestamp = response.chart.result[0].timestamp[0];

    // Transactions for symbol in this portfolio, these could be of type purchase or sale.
    let transactions = this.transactions
      .filter((t) => t.symbol === holding.symbol)
      .map((t) => ({ ...t, date: new Date(t.date).getTime() }));

    // Map of the holdings quantity at different times during range.
    const holdingTimeMachineArr = [];

    // Accumulator for quantity.
    let quantity = 0;

    // Record the holdings history at different times during the time range.
    // Iterate over the holdings transactions to build this time machine.
    for (let i = 0; i < transactions.length; i++) {
      // The current transaction for symbol
      const transaction = transactions[i];

      if (transaction.date >= firstTimestamp) {
        // This transaction occurs during the chart time period

        if (holdingTimeMachineArr.length === 0) {
          // The first transaction for this holding occurs after the start of this chart
          // Record 0 as the quantity at the start.

          holdingTimeMachineArr.push({
            time: firstTimestamp,
            quantity: 0,
          });
        }
      }

      if (transaction.type === "PURCHASE") {
        // This is a purchase add to the current holding quantity

        quantity += parseFloat(transaction.quantity);
      }

      if (transaction.type === "SALE") {
        // This is a sale remove to the current holding quantity

        quantity -= parseFloat(transaction.quantity);
      }

      if (transaction.date >= firstTimestamp) {
        // This transaction is relevant to the chart range.

        // Record the holding quantity at this time.
        holdingTimeMachineArr.push({
          time: transaction.date,
          quantity: quantity,
        });
      }
    }

    if (holdingTimeMachineArr.length === 0) {
      // No transaction occurs after the range start time.

      // Record the quantity at the most recent transaction time
      holdingTimeMachineArr.push({
        time: transactions[transactions.length - 1].date,
        quantity: quantity,
      });
    }

    return Promise.resolve({
      holding: holding,
      response: response,
      timeMachine: holdingTimeMachineArr,
    });
  }

  async mapHistory(history, historyHoldingMap) {
    let lastKnownQuote;
    const paddedChart = [];

    history.chart.forEach((action) => {
      if (action.open) {
        lastKnownQuote = {
          high: action.high,
          low: action.low,
          open: action.open,
          close: action.close,
          volume: action.volume,
        };
        paddedChart.push(action);
      } else {
        if (lastKnownQuote) {
          paddedChart.push({ date: action.date, ...lastKnownQuote, volume: 0 });
        }
      }
    });

    historyHoldingMap[history.holding.symbol] = paddedChart;
    return Promise.resolve();
  }

  async getHoldingChart(timeMachine) {
    let holdingHistoryArr = [];

    if (timeMachine.holding.class !== ASSET_CLASSES.CASH) {
      // This is a stock or crypto holding

      // Iterate over the charts x axis (time) recording the value at each
      timeMachine.response.chart.result[0].timestamp.forEach((t, i) => {
        let action = getValueAtTime(
          t,
          timeMachine.response,
          timeMachine.timeMachine
        );

        holdingHistoryArr.push(action);
      });
    } else {
      // This is a cash holding
      // Add action using the quantity for all values, as cash is the base currency.
      timeMachine.timeMachine.forEach((ac) => {
        holdingHistoryArr.push({
          date: this.getStartTime(range), // This can screw things up when before start of range!!
          high: ac.quantity,
          low: ac.quantity,
          open: ac.quantity,
          close: ac.quantity,
          volume: 0,
        });
      });
    }

    return Promise.resolve({
      holding: timeMachine.holding,
      chart: holdingHistoryArr,
    });
  }

  getSnapshotMap(symbol, holdingHistoryMap, timeSnapshotMap) {
    // the historical data for this portfolio
    const action = holdingHistoryMap[symbol];

    action.forEach((candle) => {
      // Get the snapshot for this holding at the time of this action
      let snapshot = timeSnapshotMap[candle.date];

      if (snapshot) {
        // The snapshot exists at this timestamp

        // Merge the current candle with the snapshot
        snapshot.high += candle.high;
        snapshot.close += candle.close;
        snapshot.open += candle.open;
        snapshot.low += candle.low;
        snapshot.volume += candle.volume;
        snapshot.breakout.push({ symbol: symbol, candle: candle });
      } else {
        // No snapshot exists at this timestamp

        // Initialize the snapshot with this candle for this timestamp
        snapshot = {
          high: candle.high,
          close: candle.close,
          open: candle.open,
          low: candle.low,
          volume: candle.volume,
          date: candle.date,
          breakout: [{ symbol: symbol, candle: candle }],
        };
      }
      timeSnapshotMap[candle.date] = snapshot;
    });
  }

  async adjustTimestamp(snapshot, ts, i, key, timestamps, timeSnapshotMap) {
    if (!snapshot.breakout.map((bo) => bo.symbol).includes(key)) {
      // Snapshot doesn't include a value for the current symbol

      // Timestamps before the current one, reversed
      let timestampsToSearch = timestamps
        .slice(0, i - 2)
        .reverse()
        .slice(0, 1);

      // The most recent snapshot that includes this symbol
      let recent = timestampsToSearch.find((t) =>
        timeSnapshotMap[t].breakout.map((bo) => bo.symbol).includes(key)
      );

      if (recent) {
        // Get the candle for this symbol from the most recent snapshot
        let candle = timeSnapshotMap[recent].breakout.find(
          (bo) => bo.symbol === key
        ).candle;

        if (candle.low > 0) {
          // This candle holds value

          // Use the most recent candle to update the current snapshot values
          timeSnapshotMap[ts].high += candle.high;
          timeSnapshotMap[ts].close += candle.close;
          timeSnapshotMap[ts].open += candle.open;
          timeSnapshotMap[ts].low += candle.low;
          timeSnapshotMap[ts].volume += candle.volume;
          timeSnapshotMap[ts].breakout.push({
            symbol: key,
            candle: candle,
          });
        }
      }
    }
  }

  async calcPriceActionParallel(range, interval, cashFlag) {
    if (actionCache.get(`${this.id}-${range}-${interval}-${cashFlag}`)) {
      return Promise.resolve(
        actionCache.get(`${this.id}-${range}-${interval}-${cashFlag}`)
      );
    }

    try {
      // Get the portfolios holdings
      let holdings = [...this.holdings];

      if (!cashFlag) {
        holdings = holdings.filter((h) => h.class !== ASSET_CLASSES.CASH);
      }

      const chartQueries = holdings
        .filter((h) => h.class !== ASSET_CLASSES.CASH)
        .map((h) =>
          ChartService.getChartLL(
            h.class === ASSET_CLASSES.STOCK
              ? h.symbol
              : `${h.symbol + CRYPTO_POSTFIX}`,
            interval,
            range
          )
        );

      let responses = await Promise.allSettled(chartQueries);

      responses = responses
        .filter((res) => res.status === "fulfilled")
        .map((res) => res.value);

      const timeMachineCalls = responses.map((res) => this.getTimeMachine(res));

      let timeMachines = await Promise.allSettled(timeMachineCalls);
      timeMachines = timeMachines
        .filter((res) => res.status === "fulfilled")
        .map((res) => res.value);

      const historyCalls = timeMachines.map((tm) => this.getHoldingChart(tm));

      let histories = await Promise.allSettled(historyCalls);
      histories = histories
        .filter((res) => res.status === "fulfilled")
        .map((res) => res.value);

      const holdingHistoryMap = {};

      const mapHistoryCalls = histories
        .filter((h) => h.holding)
        .map((h) => this.mapHistory(h, holdingHistoryMap));

      await Promise.allSettled(mapHistoryCalls);

      // Maps timestamps to a snapshot of the portfolio at that time
      const timeSnapshotMap = {};

      let symbolsArr = Object.keys(holdingHistoryMap);

      let snapshotCalls = symbolsArr.map((s) =>
        this.getSnapshotMap(s, holdingHistoryMap, timeSnapshotMap)
      );

      await Promise.allSettled(snapshotCalls);

      // Get all timestamps in the map, convert to numbers, and sort
      let timestamps = Object.keys(timeSnapshotMap)
        .map((ts) => +ts)
        .sort((a, b) => a - b);

      // Iterate over all timestamps that have portfolio snapshots
      timestamps.forEach(async (ts, i) => {
        // Snapshot for this timestamp
        let snapshot = timeSnapshotMap[ts];

        let adjustTimestampCalls = symbolsArr.map((s) =>
          this.adjustTimestamp(snapshot, ts, i, s, timestamps, timeSnapshotMap)
        );

        await Promise.allSettled(adjustTimestampCalls);
      });

      // The snapshots in chronological order
      let snapshots = [];

      // Iterate over all timestamps in the range
      timestamps.forEach((ts) => {
        // count indicating how many holdings are represented at this time
        let count = timeSnapshotMap[ts].breakout.filter(
          (bo) => bo.candle.open
        ).length;

        if (count === this.holdingsAtTime(ts, false).length) {
          // This snapshot represents all holdings in the portfolio

          // Add the snapshot to the array
          snapshots.push(timeSnapshotMap[ts]);
        }
      });

      actionCache.save(
        `${this.id}-${range}-${interval}-${cashFlag}`,
        snapshots
      );
      return Promise.resolve(snapshots);
    } catch (err) {
      // An error occurred during processing, resolve a descriptive error

      console.log(err);

      Promise.resolve({
        error: {
          stack: "portfolio.getPriceAction",
          message: "Something went wrong generating price action",
        },
      });
    }
  }

  /**
   * Calculate comparison chart data for the portfolio and comparisons.
   * @param {String[]} comparisons
   * @param {Number} range
   * @param {Number} interval
   */
  // async calcComparison(comparisons, range, interval) {
  //   if (
  //     comparisonCache.get(
  //       `${this.id}-${JSON.stringify(comparisons)}-${range}-${interval}`
  //     )
  //   ) {
  //     return Promise.resolve(
  //       comparisonCache.get(
  //         `${this.id}-${JSON.stringify(comparisons)}-${range}-${interval}`
  //       )
  //     );
  //   }
  //   // Gather the chart queries for comparisons to batch the requests.
  //   const queries = [];
  //   comparisons.forEach((symbol) => {
  //     queries.push(ChartService.getChartLL(symbol, interval, range));
  //   });

  //   // Get charts for each comp.
  //   let charts = await Promise.allSettled(queries);

  //   // Get quotes for each comp.
  //   let quotes = await StockService.getQuote(comparisons);

  //   if (!quotes) {
  //     console.log("failure to get quotes");
  //     if (!portfolioChart.length) {
  //       return Promise.resolve([]);
  //     }
  //   }

  //   let comparisonChartArr = [];

  //   comparisons.forEach((comp) => {
  //     // Get the previous close to use as the original number for percentage calculations.
  //     let original = quotes.quoteResponse.result.find(
  //       (resp) => resp.symbol === comp
  //     ).regularMarketPreviousClose;

  //     let market = charts.find(
  //       (res) => res.chart.result[0].meta.symbol === comp
  //     );

  //     let percentageTimeline =
  //       market.chart.result[0].indicators.quote[0].close.map((p, index) => {
  //         let curr = ((p - original) / p) * 100;

  //         if (curr === Infinity || curr === -Infinity) {
  //           const last =
  //             market.chart.result[0].indicators.quote[0].close[index - 1];
  //           curr = ((last - original) / last) * 100;
  //         }
  //         return curr;
  //       });

  //     comparisonChartArr.push({
  //       name: comp,
  //       chart: {
  //         y: percentageTimeline,
  //         x: market.chart.result[0].timestamp.map((index) => index * 1000),
  //       },
  //     });
  //   });

  //   const portfolioChart = await this.calcPriceAction(range, interval, false);

  //   if (!portfolioChart || !portfolioChart.length) {
  //     return Promise.resolve([]);
  //   }

  //   let original = portfolioChart[0].open;

  //   let portfolioPercentageTimeline = portfolioChart.map((p, index) => {
  //     let curr = ((p.close - original) / p.close) * 100;

  //     if (curr === Infinity || curr === -Infinity) {
  //       const last = portfolioChart[index - 1];
  //       curr = ((last.close - original) / last.close) * 100;
  //     }
  //     return curr;
  //   });

  //   let portfolioComparisonTimeline = {
  //     name: this.portfolio_name || "portfolio",
  //     chart: {
  //       x: portfolioChart
  //         .filter(
  //           (index) => index.date <= comparisonChartArr[0].chart.x.slice(-1)[0]
  //         )
  //         .map((index) => index.date),
  //       y: portfolioPercentageTimeline,
  //     },
  //   };

  //   let response = { [portfolioComparisonTimeline.name]: [] };
  //   comparisons.forEach((comp) => {
  //     response[comp] = [];
  //   });

  //   portfolioComparisonTimeline.chart.x.forEach((timestamp, index) => {
  //     comparisonChartArr.forEach((comparison) => {
  //       const closestMatchingIndex = comparison.chart.x.findIndex(
  //         (t) => t >= timestamp
  //       );
  //       response[comparison.name].push({
  //         value: comparison.chart.y[closestMatchingIndex],
  //         date: timestamp,
  //       });
  //     });
  //     response[portfolioComparisonTimeline.name].push({
  //       value: portfolioComparisonTimeline.chart.y[index],
  //       date: timestamp,
  //     });
  //   });

  //   comparisonCache.save(
  //     `${this.id}-${JSON.stringify(comparisons)}-${range}-${interval}`,
  //     response
  //   );
  //   return Promise.resolve(response);
  // }

  async buildCompChart(comparisonChartArr, quotes, comp, charts) {
    // Get the previous close to use as the original number for percentage calculations.
    let original = quotes.quoteResponse.result.find(
      (resp) => resp.symbol === comp
    ).regularMarketPreviousClose;

    let market = charts.find((res) => res.chart.result[0].meta.symbol === comp);

    let percentageTimeline =
      market.chart.result[0].indicators.quote[0].close.map((p, index) => {
        let curr = ((p - original) / p) * 100;

        if (curr === Infinity || curr === -Infinity) {
          const last =
            market.chart.result[0].indicators.quote[0].close[index - 1];
          curr = ((last - original) / last) * 100;
        }
        return curr;
      });

    comparisonChartArr.push({
      name: comp,
      chart: {
        y: percentageTimeline,
        x: market.chart.result[0].timestamp.map((index) => index * 1000),
      },
    });
  }

  async calcComparisonParallel(comparisons, range, interval) {
    if (
      comparisonCache.get(
        `${this.id}-${JSON.stringify(comparisons)}-${range}-${interval}`
      )
    ) {
      return Promise.resolve(
        comparisonCache.get(
          `${this.id}-${JSON.stringify(comparisons)}-${range}-${interval}`
        )
      );
    }

    // Gather the chart queries for comparisons to batch the requests.
    const queries = [];
    comparisons.forEach((symbol) => {
      queries.push(ChartService.getChartLL(symbol, interval, range));
    });

    // Get charts for each comp.
    let charts = await Promise.allSettled(queries);
    charts = charts
      .filter((res) => res.status === "fulfilled")
      .map((res) => res.value);

    // Get quotes for each comp.
    let quotes = await StockService.getQuote(comparisons);

    if (!quotes) {
      console.log("failure to get quotes");
      if (!portfolioChart.length) {
        return Promise.resolve([]);
      }
    }

    let comparisonChartArr = [];

    let compChartCalls = comparisons.map((comp) =>
      this.buildCompChart(comparisonChartArr, quotes, comp, charts)
    );

    await Promise.all(compChartCalls);

    const portfolioChart = await this.calcPriceActionParallel(
      range,
      interval,
      false
    );

    if (!portfolioChart || !portfolioChart.length) {
      return Promise.resolve([]);
    }

    let original = portfolioChart[0].open;

    let portfolioPercentageTimeline = portfolioChart.map((p, index) => {
      let curr = ((p.close - original) / p.close) * 100;

      if (curr === Infinity || curr === -Infinity) {
        const last = portfolioChart[index - 1];
        curr = ((last.close - original) / last.close) * 100;
      }
      return curr;
    });

    let portfolioComparisonTimeline = {
      name: this.portfolio_name || "portfolio",
      chart: {
        x: portfolioChart
          .filter(
            (index) => index.date <= comparisonChartArr[0].chart.x.slice(-1)[0]
          )
          .map((index) => index.date),
        y: portfolioPercentageTimeline,
      },
    };

    if (!portfolioComparisonTimeline.chart.x.length) {
      return Promise.resolve({
        Error: {
          message: `Comparison Unavailable: This may be due to markets being closed, or unavailable charts for one or more holdings.`,
        },
      });
    }

    let response = { [portfolioComparisonTimeline.name]: [] };
    comparisons.forEach((comp) => {
      response[comp] = [];
    });

    portfolioComparisonTimeline.chart.x.forEach((timestamp, index) => {
      comparisonChartArr.forEach((comparison) => {
        const closestMatchingIndex = comparison.chart.x.findIndex(
          (t) => t >= timestamp
        );
        response[comparison.name].push({
          value: comparison.chart.y[closestMatchingIndex],
          date: timestamp,
        });
      });
      response[portfolioComparisonTimeline.name].push({
        value: portfolioComparisonTimeline.chart.y[index],
        date: timestamp,
      });
    });

    comparisonCache.save(
      `${this.id}-${JSON.stringify(comparisons)}-${range}-${interval}`,
      response
    );
    return Promise.resolve(response);
  }

  getAvailableRanges() {
    if (!this.transactions || this.transactions.length === 0) {
      return [];
    }

    let availableRangesArr = [{ value: "1d", label: "Today" }];

    // The earliest recorded holding in this portfolio.
    const getgo = new Date(this.transactions[0].date);

    // Milliseconds since the getgo.
    const lifespan = new Date().getTime() - getgo.getTime();

    // Check each range and narrow down to ranges that fit within the lifespan.
    // All available ranges:
    // 1d 5d 1mo 3mo 6mo 1y 5y 10y ytd

    if (lifespan >= 1000 * 60 * 60 * 24 * 5) {
      // 5d
      availableRangesArr.push({ value: "5d", label: "Week" });
    }

    if (lifespan >= 1000 * 60 * 60 * 24 * 31) {
      // 1mo
      availableRangesArr.push({ value: "1mo", label: "1 Month" });
    }

    if (lifespan >= 1000 * 60 * 60 * 24 * 31 * 3) {
      // 3mo
      availableRangesArr.push({ value: "3mo", label: "3 Month" });
    }

    if (lifespan >= 1000 * 60 * 60 * 24 * 31 * 6) {
      // 6mo
      availableRangesArr.push({ value: "6mo", label: "6 Month" });
    }

    if (lifespan >= 1000 * 60 * 60 * 24 * 31 * 12) {
      // 1y
      availableRangesArr.push({ value: "1y", label: "1 Year" });
    }

    if (lifespan >= 1000 * 60 * 60 * 24 * 31 * 12 * 5) {
      // 5y
      availableRangesArr.push({ value: "5y", label: "5 Year" });
    }

    if (lifespan >= 1000 * 60 * 60 * 24 * 31 * 12 * 10) {
      // 10y
      availableRangesArr.push({ value: "10yr", label: "10 Year" });
    }

    // ytd is always available.
    availableRangesArr.push({ value: "ytd", label: "YTD" });

    return availableRangesArr;
  }

  // Watch portfolio for changes and send updates through the web socket.
  watch(wss, page, context) {
    this.watchInterval = setInterval(
      this.check.bind(this, wss, page, context),
      5000
    );
  }

  // Check for page relevant changes, and send updates through wss.
  check(wss, page, context) {
    let symbols = [];

    if (page === this.pages.INDEX || page === this.pages.PERFORMANCE) {
      // Gather requests for stock quotes.
      this.holdings.forEach((h) => {
        if (h.class === ASSET_CLASSES.CRYPTO) {
          symbols.push(`${h.symbol + CRYPTO_POSTFIX}`);
        } else if (h.class === ASSET_CLASSES.STOCK) {
          symbols.push(h.symbol);
        }
      });

      StockService.getQuote(symbols).then((data) => {
        if (data && data.quoteResponse && data.quoteResponse.result) {
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

                  this.calcMovers(context ? context.moversRange : "1d")
                    .then((movers) => {
                      wss.send(
                        JSON.stringify({
                          type: "movers update",
                          data: movers,
                        })
                      );
                    })
                    .catch((err) => console.error(err));
                }

                // Update the cache.
                this.cache[symbol] = res;
              }
            } else {
              // cache the response
              this.cache[symbol] = res;
            }
          });
        } else {
          console.error("check: failure to fetch data");
        }
      });

      if (page === this.pages.INDEX) {
        // Watch for changes in major indexes.
        MarketsService.getMarketsLL()
          .then((data) => {
            if (!data || data.err) {
              return;
            }
            if (
              !data.marketSummaryResponse ||
              !data.marketSummaryResponse.result
            ) {
              console.error("failure to load market data");
              return;
            }
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
          })
          .catch((err) => {
            console.log(err);
            return;
          });
      }
    }
  }

  stop() {
    clearInterval(this.watchInterval);
  }
}

module.exports = Portfolio;
