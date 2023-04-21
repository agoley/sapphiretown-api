var restify = require("restify");
var controllers = require("./contollers/index.controller");
// var chronical = require("./jobs/chronical.job");
const WebSocket = require("ws");
const Reducer = require("./common/reducer");
var http = require("http");
var fs = require("fs");
var formidable = require("formidable");
const csv = require("fast-csv");

// TODO abastract mailer/transporter
var nodemailer = require("nodemailer");

let AWS = require("aws-sdk");

AWS.config.update({
  region: "us-east-1",
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

var ddb = new AWS.DynamoDB({ apiVersion: "2012-08-10" });
var docClient = new AWS.DynamoDB.DocumentClient();

const RESTIFY_ORIGIN = process.env.RESTIFY_ORIGIN || "*";
const PORT = process.env.PORT || 8080;

var server = restify.createServer();

var enterpriseServer = restify.createServer();

// CORS CONFIG
const corsMiddleware = require("restify-cors-middleware2");
const cors = corsMiddleware({
  preflightMaxAge: 600000,
  origins: [
    RESTIFY_ORIGIN,
    "https://www.ezfol.io",
    "https://ezfol.io",
    "http://www.ezfol.io",
    "http://ezfol.io",
  ],
});

const enterpriseCors = corsMiddleware({
  preflightMaxAge: 600000,
  origins: ["x"],
});

// APPLY CORS
server.pre(cors.preflight);
server.use(cors.actual);
server.use(restify.plugins.queryParser());
server.use(
  restify.plugins.bodyParser({
    mapParams: true,
  })
);

const authenticateKey = (req, res, next) => {
  let api_key = req.header("x-api-key");

  // Find user
  var params = {
    TableName: "User",
    FilterExpression: "(api_key = :key )",
    ExpressionAttributeValues: {
      ":key": api_key,
    },
  };

  const onScan = (err, data) => {
    if (err) {
      console.error(
        "Unable to scan the table. Error JSON:",
        JSON.stringify(err, null, 2)
      );
      res.send({ error: { code: 403, message: "You not allowed." } });
    } else {
      if (data["Items"].length > 0) {
        return next();
      } else {
        res.send({ error: { code: 403, message: "You not allowed." } });
      }
    }
  };
  docClient.scan(params, onScan);
};

server.pre(enterpriseCors.preflight);
server.use(enterpriseCors.actual);
enterpriseServer.use((req, res, next) => {
  console.log(req.headers);
  if (req.headers.host === "ezfolio-enterprise-server.herokuapp.com") {
    next();
  } else {
    // Apply API Key Authentication
    authenticateKey(req, res, next);
  }
});
enterpriseServer.use(restify.plugins.queryParser());
enterpriseServer.use(
  restify.plugins.bodyParser({
    mapParams: true,
  })
);

// const wss = new WebSocket.Server({ port: 8081 });
const wss = new WebSocket.Server(server);
const reducer = new Reducer();

var transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  auth: {
    user: "help@ezfol.io",
    pass: process.env.MAIL_PASS,
  },
});

wss.on("connection", (ws) => {
  ws.on("message", (message) => {
    const data = JSON.parse(message);
    if (data.user) {
      // Check for subscription.
      reducer.handle(data, ws);

      var mailOptions = {
        from: "hello@ezfol.io",
        to: "hello@ezfol.io",
        subject: `${data.user.username} (${data.user.email}) spotted 👀`,
        html: `${data.user.username} (${data.user.email}) just visited`,
      };

      if (
        data?.user.username !== "alex" &&
        data?.user.username !== "production" &&
        data?.user.username !== "demo" &&
        data?.user.username !== "test1"
      ) {
        transporter.sendMail(mailOptions, function (error, info) {
          if (error) {
            console.log(error);
          }
        });
      }
    }
  });
});

// APPLY CONTROLLERS
controllers(server, false);
controllers(enterpriseServer, true);

var restifySwaggerJsdoc = require("restify-swagger-jsdoc");
const PortfolioService = require("./services/portfolio.service");
const Portfolio = require("./common/portfolio");

restifySwaggerJsdoc.createSwaggerPage({
  title: "EZFol.io API documentation", // Page title
  version: "1.0.0", // Server version
  server: enterpriseServer, // Restify server instance created with restify.createServer()
  path: "/docs/swagger", // Public url where the swagger page will be available
  apis: ["./index.js", "./services/*.service.js"],
  host: "https://ezfolio-enterprise-server.herokuapp.com/",
  schemes: ["https", "http"],
});

const dateRegexList = [
  /[a-zA-Z]*Date[a-zA-Z]*/im,
  /date.of.transaction/im,
  /[a-zA-Z]*Time[a-zA-Z]*/im,
];
const typeRegexList = [
  /[a-zA-Z]*Transaction*.Type[a-zA-Z]*/im,
  /[a-zA-Z]*Action[a-zA-Z]*/im,
];
const typeValuePurchaseRegexList = [
  /[a-zA-Z]*Bought[a-zA-Z]*/im,
  /[a-zA-Z]*Purchase[a-zA-Z]*/im,
  /[a-zA-Z]*Buy[a-zA-Z]*/im,
];
const typeValueSaleRegexList = [
  /[a-zA-Z]*Sold[a-zA-Z]*/im,
  /[a-zA-Z]*Sale[a-zA-Z]*/im,
];

const symbolRegexList = [
  /[a-zA-Z]*Symbol[a-zA-Z]*/im,
  /[a-zA-Z]*Ticker[a-zA-Z]*/im,
  /[a-zA-Z]*Asset[a-zA-Z]*/im,
];
const quantityRegexList = [
  /[a-zA-Z]*Quantity[a-zA-Z]*/im,
  /[a-zA-Z]*Qty[a-zA-Z]*/im,
];
const priceRegexList = [/[a-zA-Z]*Price[a-zA-Z]*/im];
const symbolRegex = /(^[A-Z!@#$%\^&*)(+=._-]+){1}$/m;
const dividendRegex = /[.]*Dividend[.]*/im;
const transferRegex = /[.]*Transfer[.]*/im;
const amountRegexList = [
  /[a-zA-Z]*Amount[a-zA-Z]*/im,
  /[a-zA-Z]*Amnt[a-zA-Z]*/im,
  /[a-zA-Z]*Total[a-zA-Z]*/im,
  /[a-zA-Z]*Subtotal[a-zA-Z]*/im,
];

let isDate = (date) => {
  return new Date(date) !== "Invalid Date" && !isNaN(new Date(date));
};

let isNumeric = (str) => {
  if (typeof str != "string") return false; // we only process strings!
  return (
    !isNaN(str) && // use type coercion to parse the _entirety_ of the string (`parseFloat` alone does not do this)...
    !isNaN(parseFloat(str))
  ); // ...and ensure strings of whitespace fail
};

const uploadTransactionsFromCSV = (req, form) => {
  return new Promise((resolve, reject) => {
    form.parse(req, async (err, fields, files) => {
      try {
        if (!files.file) {
          reject({
            data: {},
            errors: [{ message: "Unable to parse file" }],
          });
        }

        let matches = [
          ...req.url.matchAll(/^\/api\/v3\/portfolios\/(.+)\/transactions$/g),
        ][0];
        let data = await PortfolioService.getPortfolioById(matches[1]);
        const portfolios = data.Items.map((item) => {
          return {
            ...item,
            transactions: JSON.parse(item.transactions),
          };
        });

        let portfolio = new Portfolio(
          portfolios[0].id,
          portfolios[0].transactions
        );

        let fileRows = [];
        let headerRow,
          possibleDateCols = [],
          dateColIndex,
          possibleTypeCols = [],
          typeColIndex,
          possibleSymbolCols = [],
          symbolColIndex,
          possibleQuantityCols = [],
          quantityColIndex,
          possiblePriceCols = [],
          priceColIndex,
          amountColIndex,
          possibleAmountCols = [];

        csv
          .parseFile(files.file.filepath)
          .on("data", async (data) => {
            let transaction = {};
            if (!headerRow) {
              // A transaction needs at least 5 entries Date, Type, Symbol, Quantity, Price
              let isDateMatch,
                isTypeMatch,
                isSymbolMatch,
                isQuantityMatch,
                isPriceMatch;

              if (data.length >= 4) {
                data.forEach((cell, i) => {
                  if (dateRegexList.some((rx) => rx.test(cell))) {
                    isDateMatch = true;
                    possibleDateCols.push(i);
                  }
                  if (typeRegexList.some((rx) => rx.test(cell))) {
                    isTypeMatch = true;
                    possibleTypeCols.push(i);
                  }
                  if (symbolRegexList.some((rx) => rx.test(cell))) {
                    isSymbolMatch = true;
                    possibleSymbolCols.push(i);
                  }
                  if (quantityRegexList.some((rx) => rx.test(cell))) {
                    isQuantityMatch = true;
                    possibleQuantityCols.push(i);
                  }
                  if (priceRegexList.some((rx) => rx.test(cell))) {
                    isPriceMatch = true;
                    possiblePriceCols.push(i);
                  }
                  if (amountRegexList.some((rx) => rx.test(cell))) {
                    possibleAmountCols.push(i);
                  }
                });
                if (
                  isDateMatch &&
                  isPriceMatch &&
                  isQuantityMatch &&
                  isTypeMatch &&
                  isSymbolMatch
                ) {
                  headerRow = data;
                }
              }
            } else if (data.length === headerRow.length) {
              if (!dateColIndex) {
                possibleDateCols.forEach((i) => {
                  if (isDate(data[i])) {
                    dateColIndex = i;
                    transaction.date = new Date(data[i]);
                  }
                });
              } else {
                transaction.date = new Date(data[dateColIndex]);
              }

              if (!typeColIndex) {
                possibleTypeCols.forEach((i) => {
                  if (
                    [
                      ...typeValuePurchaseRegexList,
                      ...typeValueSaleRegexList,
                      dividendRegex,
                      transferRegex,
                    ].some((rx) => rx.test(data[i]))
                  ) {
                    typeColIndex = i;
                    if (
                      [
                        ...typeValuePurchaseRegexList,
                        dividendRegex,
                        transferRegex,
                      ].some((rx) => rx.test(data[i]))
                    ) {
                      transaction.type = "PURCHASE";

                      if (dividendRegex.test(data[i])) {
                        transaction.dividend = true;
                      }

                      if (transferRegex.test(data[i])) {
                        transaction.transfer = true;
                      }
                    }
                    if (typeValueSaleRegexList.some((rx) => rx.test(data[i]))) {
                      transaction.type = "SALE";
                    }
                  }
                });
              } else {
                if (
                  [
                    ...typeValuePurchaseRegexList,
                    dividendRegex,
                    transferRegex,
                  ].some((rx) => rx.test(data[typeColIndex]))
                ) {
                  transaction.type = "PURCHASE";

                  if (dividendRegex.test(data[typeColIndex])) {
                    transaction.dividend = true;
                  }

                  if (transferRegex.test(data[typeColIndex])) {
                    transaction.transfer = true;
                  }
                }
                if (
                  typeValueSaleRegexList.some((rx) =>
                    rx.test(data[typeColIndex])
                  )
                ) {
                  transaction.type = "SALE";
                }
              }

              if (!quantityColIndex) {
                possibleQuantityCols.forEach((i) => {
                  if (isNumeric(data[i])) {
                    quantityColIndex = i;
                    transaction.quantity = data[i];
                  }
                });
              } else {
                transaction.quantity = data[quantityColIndex];
              }

              if (!priceColIndex) {
                possiblePriceCols.forEach((i) => {
                  if (isNumeric(data[i])) {
                    priceColIndex = i;
                    transaction.price = data[i];
                  }
                });
              } else {
                transaction.price = data[priceColIndex];
              }

              if (!symbolColIndex) {
                possibleSymbolCols.forEach((i) => {
                  if (symbolRegex.test(data[i])) {
                    symbolColIndex = i;
                    transaction.symbol = data[i] || "USD";
                  }
                });
              } else {
                transaction.symbol = data[symbolColIndex] || "USD";
              }

              if (
                !transaction.quantity &&
                possibleAmountCols.length &&
                transaction.symbol === "USD"
              ) {
                if (!amountColIndex) {
                  possibleAmountCols.forEach((i) => {
                    if (isNumeric(data[i])) {
                      amountColIndex = i;
                      transaction.quantity = data[amountColIndex];
                    }
                  });
                } else {
                  transaction.quantity = data[amountColIndex];
                }
              }

              transaction.upload = JSON.stringify(data);
              transaction.owned = transaction.quantity;
              transaction.class = fields.class;

              if (
                transaction.type &&
                transaction.date &&
                transaction.symbol &&
                +transaction.quantity &&
                transaction.symbol &&
                transaction.symbol.trim
              ) {
                await portfolio.addTransaction(transaction);
              }
              fileRows.push(data); // push each row
            }
          })
          .on("end", async () => {
            fs.unlinkSync(files.file.filepath); // remove temp file
            if (!headerRow) {
              reject({
                data: {},
                errors: [{ message: "Unable to parse transactions from file" }],
              });
            } else {
              let res = await PortfolioService.save(portfolio);
              resolve({ data: res.Attributes, errors: [] });
            }
          });
      } catch {
        reject({
          data: {},
          errors: [{ message: "Unable to parse transactions from file" }],
        });
      }
    });
  });
};

/**
 * @swagger
 * :8445/api/v3/portfolios/:id/transactions:
 *  post:
 *    summary: Uploads a csv or excel file of transactions.
 *    consumes:
 *      - multipart/form-data
 *    requestBody:
 *      content:
 *        multipart/form-data:
 *          schema:
 *            type: object
 *            properties:
 *              class:
 *                type: string
 *              file:
 *                type: string
 *                format: binary
 *    parameters:
 *      - in: path
 *        name: id
 *        description: ID of the Portfolio to upload transactions to.
 *        required: true
 *        schema:
 *          type: string
 *          example: "271ef7f0-7f22-11ed-8d69-f9f6d36c4def"
 *      - in: body
 *        name: TransactionUploadBody
 *        description: Form data containing the form, and class of assets.
 *        schema:
 *          type: object
 *          required:
 *            - file
 *          properties:
 *            file:
 *              type: string
 *              format: binary
 *              description: The file containing transaction data.
 *            class:
 *              type: string
 *              description: The asset class, either 'stock', or 'crypto'.
 *              example: "stock"
 *    responses:
 *      '200':
 *        description: The newly added transactions, and any errors that ocurred during processing.
 *        content:
 *          application/json:
 *            schema:
 *              $ref: '#/definitions/UploadResponse'
 *
 */
http
  .createServer((req, res) => {
    const originsWhiteList = [
      RESTIFY_ORIGIN,
      "https://www.ezfol.io",
      "https://ezfol.io",
      "http://www.ezfol.io",
      "http://ezfol.io",
      "https://aqueous-beyond-14838.herokuapp.com",
      "http://aqueous-beyond-14838.herokuapp.com"
    ];

    if (
      originsWhiteList.includes("*") ||
      originsWhiteList.includes(req.headers.origin)
    ) {
      res.setHeader("Access-Control-Allow-Origin", req.headers.origin);
    }
    res.setHeader("Access-Control-Allow-Methods", "OPTIONS, GET");
    res.setHeader("Access-Control-Max-Age", 2592000); // 30 days

    if (req.method === "OPTIONS") {
      res.writeHead(204, headers);
      res.end();
      return;
    }

    if (/^\/api\/v3\/portfolios\/(.+)\/transactions$/.test(req.url)) {
      var form = new formidable.IncomingForm();
      uploadTransactionsFromCSV(req, form)
        .then((data) => {
          res.write(JSON.stringify(data));
          res.end();
        })
        .catch((err) => {
          res.write(JSON.stringify(err));
          res.end();
        });
    }
  })
  .listen(8445);

if (process.env.RUN_SERVER === "enterprise") {
  enterpriseServer.listen(PORT, function () {
    console.log(
      "%s listening at %s",
      enterpriseServer.name,
      enterpriseServer.url
    );
  });
} else {
  server.listen(PORT, function () {
    console.log("%s listening at %s", server.name, server.url);
  });
}

// Every 24hrs records all users value and add to their history.
// setInterval(() => {
//   chronical();
// }, 86400000);
