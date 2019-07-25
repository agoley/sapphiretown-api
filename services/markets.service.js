const ALPHA_ADVANTAGE_API_KEY = process.env.ALPHA_ADVANTAGE_API_KEY;
const request = require("request");

// TODO: Create wrapper of request that is observable? Or use request lib that utilizes promises?

const MarketsService = {
  nasdaq: (req, res, next) => {
    request(
      "https://www.alphavantage.co/query?function=TIME_SERIES_MONTHLY_ADJUSTED&symbol=NASDAQ:.IXIC&apikey=" +
        ALPHA_ADVANTAGE_API_KEY,
      { json: true },
      (err, res2, body) => {
        if (err) {
          return console.log(err);
        }
        res.send(body);
        return next();
      }
    );
  }
};

module.exports = MarketsService;
