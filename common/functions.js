const Functions = {
  extractLastPriceFromSeries: series => {
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

  extractChangeFromDailySeries: series => {
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
      var previousSeriesObjectCloseKey = Object.keys(
        previousSeriesObject
      )[3];
      var closePriceOfPreviousDay =
      previousSeriesObject[previousSeriesObjectCloseKey];
    //   console.log('extractPercentageFromDailySeries: close of previous day' + closePriceOfPreviousDay)

      var dailyPriceChange = closeOfCurrentDay - closePriceOfPreviousDay;
      var dailyChangePercentage = (dailyPriceChange / closePriceOfPreviousDay) * 100;
    //   console.log('extractPercentageFromDailySeries: daily change percentage' + dailyChangePercentage)

      return {
          price: dailyPriceChange.toFixed(2),
          percentage: dailyChangePercentage.toFixed(2)
      };
    }
  }
};

module.exports = Functions;
