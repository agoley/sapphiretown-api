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

const RESTIFY_ORIGIN = process.env.RESTIFY_ORIGIN || "*";
const PORT = process.env.PORT || 8080;

var server = restify.createServer();

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

// APPLY CORS
server.pre(cors.preflight);
server.use(cors.actual);
server.use(restify.plugins.queryParser());

server.use(
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
controllers(server);

var restifySwaggerJsdoc = require("restify-swagger-jsdoc");
const PortfolioService = require("./services/portfolio.service");
const Portfolio = require("./common/portfolio");

restifySwaggerJsdoc.createSwaggerPage({
  title: "EZFol.io API documentation", // Page title
  version: "1.0.0", // Server version
  server: server, // Restify server instance created with restify.createServer()
  path: "/docs/swagger", // Public url where the swagger page will be available
  apis: ["./index.js", "./services/*.service.js"],
  host: "aqueous-beyond-14838.herokuapp.com/",
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
];
const typeValueSaleRegexList = [
  /[a-zA-Z]*Sold[a-zA-Z]*/im,
  /[a-zA-Z]*Sale[a-zA-Z]*/im,
];

const symbolRegexList = [
  /[a-zA-Z]*Symbol[a-zA-Z]*/im,
  /[a-zA-Z]*Ticker[a-zA-Z]*/im,
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

const uploadTransactionsFromCSV =  (req, form) => {
  return new Promise((resolve, reject) => {
    form.parse(req, async (err, fields, files) => {
      let data = await PortfolioService.getPortfolioById(
        JSON.parse(fields.user).active_portfolio
      );
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
                typeValueSaleRegexList.some((rx) => rx.test(data[typeColIndex]))
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
            resolve({ data: res.Attributes, errors: []});
          }
        });
    });
  });
};

/**
 * @swagger
 * :8445/api/v3/transactions/upload:
 *  post:
 *    summary: Uploads a csv or excel file of transactions.
 *    consumes:
 *      - .csv
 *    parameters:
 *     - in: body
 *       name: user
 *       description: The user to create.
 *       schema:
 *          $ref: '#/definitions/User'
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

    if (req.url == "/api/v3/transactions/upload") {
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

server.listen(PORT, function () {
  console.log("%s listening at %s", server.name, server.url);
});

// Every 24hrs records all users value and add to their history.
// setInterval(() => {
//   chronical();
// }, 86400000);
