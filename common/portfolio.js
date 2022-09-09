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
        symbols.push(`${h.symbol}-USD`);
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
        symbols.push(`${h.symbol}-USD`);
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
          symbols.push(`${h.symbol}-USD`);
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

  /**
   * Get the price action of the entire portfolio as a time series.
   * @param {*} range Time range for the time series
   */
  async calcPriceAction(range, interval) {
    // Get the portfolios holdings
    const holdings = this.holdings;

    // Maps holdings to respective price action
    const holdingToPriceActionMap = {};

    // Loop through each holding and get the price action for the given range.
    for (let i = 0; i < this.holdings.length; i++) {
      // The current holding
      let holding = holdings[i];

      switch (holding.class) {
        case ASSET_CLASSES.CRYPTO:
          // Use the chart service with an extended range and filter for the desired market hours
          const ohlcv = await ChartService.getChartLL(
            `${holding.symbol}-USD`,
            interval,
            "5d"
          );

        case ASSET_CLASSES.STOCK:
          // The chart information for this symbol
          const response = await ChartService.getChartLL(
            holding.class === ASSET_CLASSES.STOCK
              ? holding.symbol
              : `${holding.symbol}-USD`,
            interval,
            range
          );

          if (!response.chart) {
            // The request failed
            console.error(response);
            break;
          }

          response.chart.result[0].timestamp =
            response.chart.result[0].timestamp.map((t) => t * 1000);

          // Get the history of this asset in the portfolio during the charts time range

          // Timestamp for the start of the action
          const rangeStartTime = response.chart.result[0].timestamp[0];

          // Transactions for symbol in this portfolio, these could be of type purchase or sale
          const transactions = this.transactions.filter(
            (t) => t.symbol === holding.symbol
          );

          // Map of the holdings quantity at different times during range
          const holdingActivityWithinRange = [];

          // Accumulator for quantity
          let quantity = 0;

          for (let i = 0; i < transactions.length; i++) {
            // The current transaction for symbol
            const transaction = transactions[i];

            if (
              transaction.date >= rangeStartTime &&
              holdingActivityWithinRange.length === 0
            ) {
              // This is the first transaction after the start of the range

              // Record the quantity at the start of the range
              holdingActivityWithinRange.push({
                time: rangeStartTime,
                quantity: quantity,
              });
            }

            // Update quantity per the transaction
            if (transaction.type === "PURCHASE") {
              quantity += parseFloat(transaction.quantity);
            }
            if (transaction.type === "SALE") {
              quantity -= parseFloat(transaction.quantity);
            }

            if (transaction.date >= rangeStartTime) {
              // This transaction occurs during the charts time range

              // Record the time and the new quantity
              holdingActivityWithinRange.push({
                time: transaction.date,
                quantity: quantity,
              });
            }
          }

          if (holdingActivityWithinRange.length === 0) {
            // no transaction occurs after the range start time

            // Record the quantity at the end of the range
            holdingActivityWithinRange.push({
              time: rangeStartTime,
              quantity: quantity,
            });
          }

          // Get the price action for this holding using the chart data and holdings
          // history

          let holdingActionChartData = [];

          /**
           * Gets the value of the holding at a point in time
           * @param {*} timestamp 
           * @param {*} field field in question (high, low, open, close, volume)
           * @returns {number} the value of the holding in the portfolio at the corresponding time
           */
          const getValueAtTime = (timestamp, field) => {
            // TODO use timestamp to find index instead of index, because not all charts are guaranteed to have the same length

            const index = response.chart.result[0].timestamp.findIndex(ts => ts === timestamp);

            const closestActivityBeforeOrAtTime = holdingActivityWithinRange
              .reverse()
              .find(
                (activity) =>
                  activity.time <= response.chart.result[0].timestamp[index]
              );

            if (!closestActivityBeforeOrAtTime) {
              // There is no activity before or at this time, thus no value in the portfolio

              return 0;
            }

            return (
              closestActivityBeforeOrAtTime.quantity *
              response.chart.result[0].indicators.quote[0][field][index]
            );
          };

          // TODO: Process the chart data
          // Loop through time periods of length interval from
          // start to end times, get the value of the portfolio 
          // at each time period to get the OHCLV for that time 
          // period

          response.chart.result[0].timestamp.forEach((t, i) => {
            // if (i <= minLength) {
            holdingActionChartData.push({
              date: new Date(t).toLocaleTimeString(),
              high: getValueAtTime(t, "high"),
              low: getValueAtTime(t, "low"),
              open: getValueAtTime(t, "open"),
              close: getValueAtTime(t, "close"),
              volume: response.chart.result[0].indicators.quote[0]["volume"][i],
            });
            // }
          });

          holdingToPriceActionMap[holding.symbol] = holdingActionChartData;
          break;
        default:
          console.log("huh? handle me");
          break;
      }
    }

    // Join all holdings to get the total portfolio values

    // List of joined values
    const totalPortfolioAction = [];

    for (
      let i = 0;
      i <
      holdingToPriceActionMap[Object.keys(holdingToPriceActionMap)[0]].length;
      i++
    ) {
      let joinedIndicators = {
        date: holdingToPriceActionMap[
          Object.keys(holdingToPriceActionMap)[0]
        ][0].date,
        high: 0,
        low: 0,
        open: 0,
        close: 0,
        volume: 0,
      };

      for (const key in holdingToPriceActionMap) {
        joinedIndicators.high += holdingToPriceActionMap[key][i].high;
        joinedIndicators.low += holdingToPriceActionMap[key][i].low;
        joinedIndicators.open += holdingToPriceActionMap[key][i].open;
        joinedIndicators.close += holdingToPriceActionMap[key][i].close;
        joinedIndicators.volume += holdingToPriceActionMap[key][i].volume;
      }

      totalPortfolioAction.push(joinedIndicators);
    }

    return Promise.resolve(totalPortfolioAction);
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
        MarketsService.getMarketsLL().then((data) => {
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
        });
      }
    }
  }

  stop() {
    clearInterval(this.interval);
  }
}

module.exports = Portfolio;
