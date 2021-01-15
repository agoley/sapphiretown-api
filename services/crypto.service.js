var unirest = require("unirest");
const Cache = require("../common/cache");
const messengers = require("../common/messenger");

const X_CMC_PRO_API_KEY = process.env.X_CMC_PRO_API_KEY;

var qouteCache = new Cache();
var mapCache = new Cache();
var autocompleteCache = new Cache();

const getQoute = (symbol) => {
  var uni = unirest(
    "GET",
    "https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest"
  );

  uni.query({
    symbol: symbol,
  });

  uni.headers({
    "X-CMC_PRO_API_KEY": X_CMC_PRO_API_KEY,
  });

  return new Promise((resolve, reject) => {
    let tag = messengers.cmc.load(uni.send());
    messengers.cmc.responses.subscribe({
      next: (v) => {
        if (v.id === tag) {
          resolve(v.data);
        }
      },
    });
  });
};

const getMap = () => {
  if (mapCache.get("map")) {
    return new Promise((resolve, reject) => {
      resolve(mapCache.get("map"));
    });
  }
  var uni = unirest(
    "GET",
    "https://pro-api.coinmarketcap.com/v1/cryptocurrency/map"
  );

  uni.headers({
    "X-CMC_PRO_API_KEY": X_CMC_PRO_API_KEY,
  });

  return new Promise((resolve, reject) => {
    let tag = messengers.cmc.load(uni.send());
    messengers.cmc.responses.subscribe({
      next: (v) => {
        if (v.id === tag) {
          mapCache.save("map", v.data);
          resolve(v.data);
        }
      },
    });
  });
};

const getMatches = (quote) => {};

const CryptoService = {
  qoute: (req, res, next, count) => {
    if (qouteCache.get(req.body.symbol)) {
      res.send(qouteCache.get(req.body.symbol));
      return next();
    }

    getQoute(req.body.symbol)
      .then((data) => {
        qouteCache.save(req.body.symbol, data);
        res.send(data);
        return next();
      })
      .catch((err) => {
        count = count ? count + 1 : 1;
        if (count < 5) {
          // Wait 1s and retry.
          setTimeout(() => {
            CryptoService.qoute(req, res, next, count);
          }, 1000);
        } else {
          res.send(err);
          return next();
        }
      });
  },
  autocomplete: (req, res, next, count) => {
    if (autocompleteCache.get(req.body.query)) {
      res.send(autocompleteCache.get(req.body.query));
      return next();
    }

    getMap().then((map) => {
      const matches = map.data
        .filter(
          (coin) =>
            coin.symbol.toLowerCase().includes(req.body.query.toLowerCase()) ||
            coin.name.toLowerCase().includes(req.body.query.toLowerCase())
        )
        .map((coin) => {
          return { symbol: coin.symbol, shortname: coin.name };
        })
        .slice(0, 10);

      const response = { count: matches.length, quotes: matches };
      autocompleteCache.save(req.body.query, response);
      res.send(response);
      return next();
    });
  },
  getQoute: getQoute,
  getMap: getMap,
};

module.exports = CryptoService;
