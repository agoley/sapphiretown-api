var unirest = require("unirest");
const Cache = require("../common/cache");

const X_RAPID_API_HOST = process.env.X_RAPID_API_HOST;
const X_RAPID_API_KEY = process.env.X_RAPID_API_KEY;

var queryCache = new Cache();

const QueryService = {
  query: (req, res, next, count) => {
    if (queryCache.get(req.body.symbol)) {
      res.send(queryCache.get(req.body.symbol));
      return next();
    }

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
      count = count ? count + 1 : 1;
      if (yahoo.status !== 200 && count < 5) {
        setTimeout(() => {
          QueryService.query(req, res, next, count);
        }, 5000);
      } else {
        queryCache.save(req.body.symbol, yahoo.body);
        res.send(yahoo.body);
        return next();
      }
    });
  }
};

module.exports = QueryService;
