const ALPHA_ADVANTAGE_API_KEY = process.env.ALPHA_ADVANTAGE_API_KEY;
const rp = require("request-promise");

const IntradayService = {
  query: (req, res, next) => {
    rp(
      "https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol=" + req.body.symbol + "&interval=5min&apikey=" + 
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

module.exports = IntradayService;
