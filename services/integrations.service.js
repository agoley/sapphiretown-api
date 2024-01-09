var unirest = require("unirest");
var convert = require("xml-js");
const crypto = require("crypto");
const { hmacsign } = require("../common/oauth-sign");

const IntegrationsService = {
  requestToken: (req, res, next, count) => {
    const oauth_consumer_key = "7edfd494ff89d7c2dace7424b12a3bf2";
    const consumer_secret =
      "0cbed8cfa374e8955459a42e45db8b14d41554d73c96e4aedf3466115513d2d4";
    const base_uri = "https://api.etrade.com/oauth/request_token";
    const oauth_timestamp = (new Date().getTime() / 1000).toFixed(0);
    const oauth_nonce = crypto.randomBytes(32).toString("base64");
    const oauth_signature_method = "HMAC-SHA1";
    const oauth_callback = "oob"; // out-of-band callback

    const oauth_signature = hmacsign(
      "GET",
      base_uri,
      {
        oauth_consumer_key,
        oauth_timestamp,
        oauth_nonce,
        oauth_signature_method,
        oauth_callback,
      },
      consumer_secret
    );
    // const paramsString = Object.entries({
    //   oauth_consumer_key,
    //   oauth_timestamp,
    //   oauth_nonce,
    //   oauth_signature_method,
    //   oauth_callback,
    //   oauth_signature,
    // })
    //   .map(([k, v]) => `${k}=${v}`)
    //   .join("&");

    // const result = `${base_uri}?${paramsString}`;
    // var uni = unirest("GET", result);

    var uni = unirest("GET", base_uri);
    uni.headers({
      Authorization: `OAuth oauth_nonce="${encodeURIComponent(
        oauth_nonce
      )}", oauth_consumer_key="${oauth_consumer_key}", oauth_timestamp="${oauth_timestamp}", oauth_signature_method="${oauth_signature_method}", oauth_callback="${oauth_callback}", oauth_signature="${encodeURIComponent(
        oauth_signature
      )}"`,
    });

    uni.send().then((response) => {
      res.send(response);
      return next();
    });
  },
  accessToken: (req, res, next, count) => {
    const oauth_consumer_key = "7edfd494ff89d7c2dace7424b12a3bf2";
    const consumer_secret =
      "0cbed8cfa374e8955459a42e45db8b14d41554d73c96e4aedf3466115513d2d4";
    const base_uri = "https://api.etrade.com/oauth/access_token";
    const oauth_timestamp = (new Date().getTime() / 1000).toFixed(0);
    const oauth_nonce = crypto.randomBytes(32).toString("base64");
    const oauth_signature_method = "HMAC-SHA1";
    const oauth_token = req.body.token;
    const oauth_verifier = req.body.verifier;

    const oauth_signature = hmacsign(
      "GET",
      base_uri,
      {
        oauth_consumer_key,
        oauth_timestamp,
        oauth_nonce,
        oauth_signature_method,
        oauth_token,
        oauth_verifier,
      },
      consumer_secret,
      req.body.token_secret
    );

    var uni = unirest("GET", base_uri);

    uni.headers({
      Authorization: `OAuth oauth_consumer_key="${oauth_consumer_key}",oauth_timestamp="${oauth_timestamp}",oauth_nonce="${encodeURIComponent(
        oauth_nonce
      )}",oauth_signature_method="${oauth_signature_method}",oauth_token="${encodeURIComponent(
        oauth_token
      )}",oauth_verifier="${oauth_verifier}",oauth_signature="${encodeURIComponent(
        oauth_signature
      )}"`,
    });

    uni.send().then((response) => {
      res.send(response);
      return next();
    });
  },
  etradeListAccounts: (req, res, next, count) => {
    const oauth_consumer_key = "7edfd494ff89d7c2dace7424b12a3bf2";
    const consumer_secret =
      "0cbed8cfa374e8955459a42e45db8b14d41554d73c96e4aedf3466115513d2d4";
    const base_uri = "https://api.etrade.com/v1/accounts/list";
    const oauth_timestamp = (new Date().getTime() / 1000).toFixed(0);
    const oauth_nonce = crypto.randomBytes(32).toString("base64");
    const oauth_signature_method = "HMAC-SHA1";
    const oauth_token = req.body.token;

    const oauth_signature = hmacsign(
      "GET",
      base_uri,
      {
        oauth_consumer_key,
        oauth_timestamp,
        oauth_nonce,
        oauth_signature_method,
        oauth_token,
      },
      consumer_secret,
      req.body.token_secret
    );

    var uni = unirest("GET", base_uri);

    uni.headers({
      Authorization: `OAuth oauth_consumer_key="${oauth_consumer_key}",oauth_timestamp="${oauth_timestamp}",oauth_nonce="${encodeURIComponent(
        oauth_nonce
      )}",oauth_signature_method="${oauth_signature_method}",oauth_token="${encodeURIComponent(
        oauth_token
      )}",oauth_signature="${encodeURIComponent(oauth_signature)}"`,
    });

    uni.send().then((response) => {
      if (response.statusCode === 200) {
        res.send(
          JSON.parse(
            convert.xml2json(response.body, { compact: true, spaces: 4 })
          )
        );
      } else {
        res.send(response);
      }
      return next();
    });
  },
  etradeTransactions: (req, res, next, count) => {
    const oauth_consumer_key = "7edfd494ff89d7c2dace7424b12a3bf2";
    const consumer_secret =
      "0cbed8cfa374e8955459a42e45db8b14d41554d73c96e4aedf3466115513d2d4";
    const base_uri = `https://api.etrade.com/v1/accounts/${req.params.accountIdKey}/transactions`;
    const oauth_timestamp = (new Date().getTime() / 1000).toFixed(0);
    const oauth_nonce = crypto.randomBytes(32).toString("base64");
    const oauth_signature_method = "HMAC-SHA1";
    const oauth_token = req.body.token;
    const startDate = req.body.startDate;
    const endDate = req.body.endDate;

    const oauth_signature = hmacsign(
      "GET",
      base_uri,
      {
        oauth_consumer_key,
        oauth_timestamp,
        oauth_nonce,
        oauth_signature_method,
        oauth_token,
        startDate,
        endDate
      },
      consumer_secret,
      req.body.token_secret
    );

    const paramsString = Object.entries({
      startDate,
      endDate,
    })
      .map(([k, v]) => `${k}=${v}`)
      .join("&");

    const result = `${base_uri}?${paramsString}`;


    var uni = unirest("GET", result);

    uni.headers({
      Authorization: `OAuth oauth_consumer_key="${oauth_consumer_key}",oauth_timestamp="${oauth_timestamp}",oauth_nonce="${encodeURIComponent(
        oauth_nonce
      )}",oauth_signature_method="${oauth_signature_method}",oauth_token="${encodeURIComponent(
        oauth_token
      )}",oauth_signature="${encodeURIComponent(oauth_signature)}"`,
    });

    uni.send().then((response) => {
      if (response.statusCode === 200) {
        res.send(
          JSON.parse(
            convert.xml2json(response.body, { compact: true, spaces: 4 })
          )
        );
      } else {
        res.send(response);
      }
      return next();
    });
  },
};

module.exports = IntegrationsService;
