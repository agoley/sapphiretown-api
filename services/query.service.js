var unirest = require("unirest");

const X_RAPID_API_HOST = process.env.X_RAPID_API_HOST;
const X_RAPID_API_KEY = process.env.X_RAPID_API_KEY;

const QueryService = {
  query: (req, res, next) => {
    var uni = unirest(
      "GET",
      "https://" + X_RAPID_API_HOST + "/stock/get-detail"
    );

    uni.query({
      region: "US",
      lang: "en",
      symbol: req.body.symbol
    });

    uni.headers({
      "x-rapidapi-host": X_RAPID_API_HOST,
      "x-rapidapi-key": X_RAPID_API_KEY
    });

    uni.end(function(yahoo) {
      if (res.error) throw new Error(res.error);

      res.send(yahoo.body);
      return next();
    });
  }
};

module.exports = QueryService;
