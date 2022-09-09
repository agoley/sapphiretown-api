const { interval } = require("rxjs");

const Functions = {
  extractLastPriceFromSeries: (series) => {
    if (typeof series === "object") {
      // See response from query or AlphaAdvantage documentation for Object API.

      // Get the series object.
      var timeSeriesKey = Object.keys(series)[1];
      var timeSeriesObject = series[timeSeriesKey];

      // Get the most recent listing.
      var mostRecentSeriesObjectKey = Object.keys(timeSeriesObject)[0];
      var mostRecentSeriesObject = timeSeriesObject[mostRecentSeriesObjectKey];

      // Get the close price for the listing.
      var mostRecentSeriesObjectCloseKey = Object.keys(
        mostRecentSeriesObject
      )[3];
      var lastPriceFromSeries =
        mostRecentSeriesObject[mostRecentSeriesObjectCloseKey];

      return lastPriceFromSeries;
    }
  },

  extractChangeFromDailySeries: (series) => {
    if (typeof series === "object") {
      // See response from query or AlphaAdvantage documentation for Object API.

      // Get the series object.
      var timeSeriesKey = Object.keys(series)[1];
      var timeSeriesObject = series[timeSeriesKey];

      // Get the most recent listing.
      var mostRecentSeriesObjectKey = Object.keys(timeSeriesObject)[0];
      var mostRecentSeriesObject = timeSeriesObject[mostRecentSeriesObjectKey];

      // Get the close price for the listing.
      var closeOfCurrentDayKey = Object.keys(mostRecentSeriesObject)[3];
      var closeOfCurrentDay = mostRecentSeriesObject[closeOfCurrentDayKey];
      //   console.log('extractPercentageFromDailySeries: close of current day' + closeOfCurrentDay)

      // Get the previous listing.
      var previousSeriesObjectKey = Object.keys(timeSeriesObject)[1];
      var previousSeriesObject = timeSeriesObject[previousSeriesObjectKey];

      // Get the close price for the previous day.
      var previousSeriesObjectCloseKey = Object.keys(previousSeriesObject)[3];
      var closePriceOfPreviousDay =
        previousSeriesObject[previousSeriesObjectCloseKey];
      //   console.log('extractPercentageFromDailySeries: close of previous day' + closePriceOfPreviousDay)

      var dailyPriceChange = closeOfCurrentDay - closePriceOfPreviousDay;
      var dailyChangePercentage =
        (dailyPriceChange / closePriceOfPreviousDay) * 100;
      //   console.log('extractPercentageFromDailySeries: daily change percentage' + dailyChangePercentage)

      return {
        price: dailyPriceChange.toFixed(2),
        percentage: dailyChangePercentage.toFixed(2),
      };
    }
  },

  getIntervalTime: (interval) => {
    switch (interval) {
      case "1m":
        return 60000;
      case "5m":
        return 60000 * 5;
      case "15m":
        return 60000 * 15;
      case "1d":
        return 60000 * 60 * 24;
      case "1wk":
        return 60000 * 60 * 24 * 7;
      case "1mo":
        return 60000 * 60 * 24 * 30;
      default:
        return 60000;
    }
  },

  getRangeStartTime: (range) => {
    let date;
    switch (range) {
      case "1d":
        // Return the epoch time at the start of the current day
        date = new Date();
        date.setHours(0);
        date.setMinutes(0);
        date.setSeconds(0);
        date.setMilliseconds(0);
        return date.getTime();
      case "5d":
        // Return the epoch time at the start of 5 days ago
        date = new Date();
        date.setHours(0);
        date.setMinutes(0);
        date.setSeconds(0);
        date.setMilliseconds(0);
        // Five days in MS
        var fiveDaysTime = 24 * 60 * 60 * 1000 * 5;
        return date.getTime() - fiveDaysTime;
      case "1mo":
        // Return the epoch time at the start of the month
        date = new Date();
        date.setHours(0);
        date.setMinutes(0);
        date.setSeconds(0);
        date.setMilliseconds(0);
        // Day of month time in MS
        let monthTime = 24 * 60 * 60 * 1000 * date.getDay();
        return date.getTime() - monthTime;
      case "3mo":
        date = new Date();
        date.setMonth(date.getMonth() - 3);
        date.setHours(0);
        date.setMinutes(0);
        date.setSeconds(0);
        date.setMilliseconds(0);
        return date.getTime();
      case "6mo":
        date = new Date();
        date.setMonth(date.getMonth() - 6);
        date.setHours(0);
        date.setMinutes(0);
        date.setSeconds(0);
        date.setMilliseconds(0);
        return date.getTime();
      case "1y":
        date = new Date();
        date.setFullYear(date.getFullYear() - 1);
        date.setHours(0);
        date.setMinutes(0);
        date.setSeconds(0);
        date.setMilliseconds(0);
        return date.getTime();
      case "5y":
        date = new Date();
        date.setFullYear(date.getFullYear() - 5);
        date.setHours(0);
        date.setMinutes(0);
        date.setSeconds(0);
        date.setMilliseconds(0);
        return date.getTime();
      case "10y":
        date = new Date();
        date.setFullYear(date.getFullYear() - 10);
        date.setHours(0);
        date.setMinutes(0);
        date.setSeconds(0);
        date.setMilliseconds(0);
        return date.getTime();
      case "ytd":
        date = new Date();
        date.setMonth(0);
        date.setHours(0);
        date.setMinutes(0);
        date.setSeconds(0);
        date.setMilliseconds(0);
        return date.getTime();
      case "max":
        return 0;
      default:
        // return 1d by default
        date = new Date();
        date.setHours(0);
        date.setMinutes(0);
        date.setSeconds(0);
        date.setMilliseconds(0);
        return date.getTime();
    }
  },
};

module.exports = Functions;
