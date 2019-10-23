var unirest = require("unirest");

const X_RAPID_API_HOST = process.env.X_RAPID_API_HOST;
const X_RAPID_API_KEY = process.env.X_RAPID_API_KEY;

const MarketsService = {
  markets: (req, res, next, count) => {
    var uni = unirest(
      "GET",
      "https://" + X_RAPID_API_HOST + "/market/get-summary"
    );

    uni.query({
      region: "US",
      lang: "en"
    });

    uni.headers({
      "x-rapidapi-host": X_RAPID_API_HOST,
      "x-rapidapi-key": X_RAPID_API_KEY
    });

    uni.end(function(yahoo) {
      if (res.error) throw new Error(res.error);
      if (yahoo.status !== 200 && count < 5) {
        setTimeout(() => {
          MarketsService.markets(req, res, next, count);
        }, 5000);
      } else {
        res.send(yahoo.body);
        return next();
      }
    });
  },
  autocomplete: (req, res, next, count) => {
    var uni = unirest(
      "GET",
      "https://" + X_RAPID_API_HOST + "/market/auto-complete"
    );

    uni.query({
      region: "US",
      lang: "en",
      query: req.body.query
    });

    uni.headers({
      "x-rapidapi-host": X_RAPID_API_HOST,
      "x-rapidapi-key": X_RAPID_API_KEY
    });

    uni.end(function(yahoo) {
      if (res.error) throw new Error(res.error);
      if (yahoo.status !== 200 && count < 5) {
        setTimeout(() => {
          MarketsService.autocomplete(req, res, next, count);
        }, 5000);
      } else {
        res.send(yahoo.body);
        return next();
      }
    });
  }
};

module.exports = MarketsService;
