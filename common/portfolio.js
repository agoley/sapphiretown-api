const QueryService = require("../services/query.service");
const StockService = require("../services/stock.service");
const ChartService = require("../services/chart.service");
import { forkJoin, Subject } from "rxjs";
import CryptoService from "../services/crypto.service";
import MarketsService from "../services/markets.service";

const ASSET_CLASSES = {
  STOCK: "stock",
  CRYPTO: "crypto",
  CASH: "cash",
};

const CRYPTO_POSTFIX = "-USD";

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
    this.interval;
    this.cache = {};
    this.pages = {
      INDEX: "INDEX",
      PERFORMANCE: "PERFORMANCE",
      PORTFOLIOS: "PORTFOLIOS",
    };
    this.portfolio_name = portfolio_name;
  }

  get holdings() {
    const holdings = this.calcHoldings();
    return holdings;
  }

  get totalGain() {}

  get realizedGain() {}

  get cash() {}

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

  calcSummary() {
    const symbols = [];
    let startingPriceOnDay = 0;
    let currentPriceOnDay = 0;
    let cashBalance = 0;

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
      });
    }

    let allTimeStart = this.transactions
      .filter((t) => t.class !== "cash")
      .reduce((prev, curr) => {
        return prev + curr.price * curr.quantity;
      }, 0);
    allTimeStart = allTimeStart.toFixed(2);

    return new Promise((resolve, reject) => {
      if (symbols.length) {
        StockService.getQuote(symbols).then((data) => {
          data.quoteResponse.result.forEach((quote) => {
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

  /**
   * Get the price action of the entire portfolio as a time series.
   * @param {*} range Time range for the time series
   * @param {*} Interval interval for values in time series
   */
  async calcPriceAction(range, interval) {
    try {
      // Get the portfolios holdings
      const holdings = this.holdings;

      // Maps holdings to respective price action
      const holdingHistoryMap = {};

      // Loop through each holding and get the price action for the given range.
      for (let i = 0; i < this.holdings.length; i++) {
        // The current holding
        let holding = holdings[i];

        // References the chart api response, and the first timestamp in the chart.
        let response, firstTimestamp;

        if (holding.class !== ASSET_CLASSES.CASH) {
          // The chart information for this symbol.
          response = await ChartService.getChartLL(
            holding.class === ASSET_CLASSES.STOCK
              ? holding.symbol
              : `${holding.symbol + CRYPTO_POSTFIX}`,
            interval,
            range
          );

          if (!(response && response.chart && response.chart.result[0])) {
            // The request failed.
            console.error(response);
            // Throw an error, to be caught and handled down stream.
            throw new Error();
          }

          // Convert timestamps to ms
          response.chart.result[0].timestamp =
            response.chart.result[0].timestamp.map((t) => t * 1000);

          firstTimestamp = response.chart.result[0].timestamp[0];
        }

        // Transactions for symbol in this portfolio, these could be of type purchase or sale.
        const transactions = this.transactions
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

        // The history of value for this holding.
        let holdingHistoryArr = [];

        if (holding.class !== ASSET_CLASSES.CASH) {
          // This is a stock or crypto holding

          // Iterate over the charts x axis (time) recording the value at each
          response.chart.result[0].timestamp.forEach((t, i) => {
            let action = getValueAtTime(t, response, holdingTimeMachineArr);

            holdingHistoryArr.push(action);
          });
        } else {
          // This is a cash holding

          // Add action using the quantity for all values, as cash is the base currency.
          holdingTimeMachineArr.forEach((ac) => {
            holdingHistoryArr.push({
              date: ac.time,
              high: ac.quantity,
              low: ac.quantity,
              open: ac.quantity,
              close: ac.quantity,
              volume: 0,
            });
          });
        }

        holdingHistoryMap[holding.symbol] = holdingHistoryArr;
      }

      // Maps timestamps to a snapshot of the portfolio at that time
      const timeSnapshotMap = {};

      let symbolsArr = Object.keys(holdingHistoryMap);

      // Iterate over all symbols in the portfolio
      symbolsArr.forEach((key) => {
        // the historical data for this portfolio
        const action = holdingHistoryMap[key];

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
            snapshot.breakout.push({ symbol: key, candle: candle });
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
              breakout: [{ symbol: key, candle: candle }],
            };
          }
          timeSnapshotMap[candle.date] = snapshot;
        });
      });

      // Get all timestamps in the map, convert to numbers, and sort
      const timestamps = Object.keys(timeSnapshotMap)
        .map((ts) => +ts)
        .sort((a, b) => a - b);

      // Iterate over all timestamps that have portfolio snapshots
      timestamps.forEach((ts, i) => {
        // Snapshot for this timestamp
        let snapshot = timeSnapshotMap[ts];

        // Iterate over all symbols
        symbolsArr.forEach((key) => {
          if (!snapshot.breakout.map((bo) => bo.symbol).includes(key)) {
            // Snapshot doesn't include a value for the current symbol

            // Timestamps before the current one, reversed
            let timestampsToSearch = timestamps.slice(0, i - 1).reverse().slice(0, 1);

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
        });
      });

      // The snapshots in chronological order
      let snapshots = [];

      // Iterate over all timestamps in the range
      timestamps.forEach((ts) => {
        // count indicating how many holdings are represented at this time
        let count = 0;

        timeSnapshotMap[ts].breakout.forEach((bo) => {
          if (bo.candle.open > 0) {
            // Increment count for each holding represented in this snapshot
            count++;
          }
        });

        if (count === symbolsArr.length) {
          // This snapshot represents all holdings in the portfolio

          // Add the snapshot to the array
          snapshots.push(timeSnapshotMap[ts]);
        }
      });

      return Promise.resolve(snapshots);
    } catch (err) {
      // An error occurred during processing, resolve a descriptive error

      Promise.resolve({
        error: {
          stack: "portfolio.getPriceAction",
          message: "Something went wrong generating price action",
        },
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

                  this.calcMovers(context.moversRange)
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
            if (data.err) {
              console.log(data.err);
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
    clearInterval(this.interval);
  }
}

module.exports = Portfolio;
