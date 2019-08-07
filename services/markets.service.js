const ALPHA_ADVANTAGE_API_KEY = process.env.ALPHA_ADVANTAGE_API_KEY;
const rp = require("request-promise");

const MarketsService = {
  nasdaq: (req, res, next) => {
    rp(
      "https://www.alphavantage.co/query?function=TIME_SERIES_MONTHLY_ADJUSTED&symbol=NASDAQ:.IXIC&apikey=" +
        ALPHA_ADVANTAGE_API_KEY,
      { json: true }
    )
      .then(data => {
        res.send(data);
        return next();
      })
      .catch(error => {
        console.log(error);
        res.send(error);
        return next();
      });
  }
};

module.exports = MarketsService;
