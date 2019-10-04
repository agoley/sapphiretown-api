var unirest = require("unirest");

const X_RAPID_API_HOST = process.env.X_RAPID_API_HOST;
const X_RAPID_API_KEY = process.env.X_RAPID_API_KEY;

const QueryService = {
  query: (req, res, next, count) => {
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
      // console.log(yahoo.status)

      count = count ? count + 1 : 1;
      if (yahoo.status !== 200 && count < 5) {
        setTimeout(() => {
          QueryService.query(req, res, next, count);
        }, 5000);
      } else {
        res.send(yahoo.body);
        return next();
      }
    });
  }
};

module.exports = QueryService;
