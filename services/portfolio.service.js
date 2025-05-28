let AWS = require("aws-sdk");
const { v1: uuidv1 } = require("uuid");
const Portfolio = require("../common/portfolio");
var fs = require("fs");
var formidable = require("formidable");
const csv = require("fast-csv");
const Cache = require("../common/cache");

AWS.config.update({
  region: "us-east-1",
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

var ddb = new AWS.DynamoDB({ apiVersion: "2012-08-10" });
var docClient = new AWS.DynamoDB.DocumentClient();

const ASSET_CLASSES = {
  STOCK: "stock",
  CRYPTO: "crypto",
  CASH: "cash",
};

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

const actionCache = new Cache(20000);
const summaryCache = new Cache(20000);

/**
 * @swagger
 * /api/v4/portfolios/{id}/transactions:
 *   get:
 *     summary: Bulk uploads transactions
 *     parameters:
 *     - in: path
 *       name: id
 *       required: true
 *       description: ID of the Portfolio.
 *       schema:
 *         type: string
 *         example: "271ef7f0-7f22-11ed-8d69-f9f6d36c4def"
 *     - in: body
 *       name: transactions
 *       type: array
 *       items:
 *         $ref: '#/definitions/Transaction'
 *     responses:
 *       '200':
 *         description: Portfolio after updating
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/definitions/Portfolio'
 */
const bulkAddTransactions = async (id, transactions) => {
  return new Promise(async (resolve, reject) => {
    try {
      let data = await PortfolioService.getPortfolioById(id);
      const portfolios = data.Items.map((item) => {
        return {
          ...item,
          transactions: JSON.parse(item.transactions),
        };
      });

      if (!portfolios.length) {
        reject({
          error: {
            message: "Failed to retrieve portfolio",
          },
        });
      }

      let portfolio = new Portfolio(
        portfolios[0].id,
        portfolios[0].transactions
      );

      transactions.forEach(async (transaction) => {
        if (
          transaction.type &&
          transaction.date &&
          transaction.symbol &&
          +transaction.quantity &&
          transaction.symbol &&
          transaction.price
        ) {
          transaction.owned = transaction.quantity;
          if (!transaction.class) {
            transaction.class = ASSET_CLASSES.STOCK;
          }
          await portfolio.addTransaction(transaction);
        }
      });
      let res = await PortfolioService.save(portfolio);
      resolve(true);
    } catch (err) {
      console.log(err);
      reject(err);
    }
  });
};

const previewTransactionsFromCSV = (req, form) => {
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

        let transactions = [];

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
              // A transaction needs at least 4 entries Date, Symbol, Quantity, Price
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

              if (!transaction.type) {
                if (transaction.quantity) {
                  transaction.type =
                    transaction.quantity > 0 ? "PURCHASE" : "SALE";
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
                transactions.push(transaction);
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
              resolve({ transactions: transactions, errors: [] });
            }
          })
          .on("error", (error) => {
            reject({
              data: { error },
              errors: [{ message: "Unable to parse transactions from file" }],
            });
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

const getPortfolioByUserId = (id) => {
  return new Promise((resolve, reject) => {
    var params = {
      TableName: "Portfolio",
      FilterExpression: "(user_id = :user_id)",
      ExpressionAttributeValues: {
        ":user_id": id,
      },
    };

    const onScan = (err, data) => {
      if (err) {
        console.error(
          "Unable to scan the table. Error JSON:",
          JSON.stringify(err, null, 2)
        );
        resolve([]);
      } else {
        resolve(data);
      }
    };
    docClient.scan(params, onScan);
  });
};

/**
 * @swagger
 * definitions:
 *   Candle:
 *     type: object
 *     properties:
 *       date:
 *         type: string
 *       high:
 *         type: number
 *         description: High price for this interval
 *         example: "55552"
 *       close:
 *         type: number
 *         description: Closing price for this interval
 *         example: "54321"
 *       open:
 *         type: number
 *         description: Opening price for this interval
 *         example: "53621"
 *       low:
 *         type: number
 *         description: Low price for this interval
 *         example: "52621"
 *       volume:
 *         type: number
 *         description: Volume during this interval
 *         example: "16096813"
 *   Breakout:
 *     type: object
 *     properties:
 *       symbol:
 *         type: string
 *         description: Ticker for this holding
 *         example: "AAPL"
 *       candle:
 *         type: object
 *         $ref: '#/definitions/Candle'
 *   Action:
 *     type: object
 *     properties:
 *       high:
 *         type: number
 *         description: High price for this interval
 *         example: "55552"
 *       close:
 *         type: number
 *         description: Closing price for this interval
 *         example: "54321"
 *       open:
 *         type: number
 *         description: Opening price for this interval
 *         example: "53621"
 *       low:
 *         type: number
 *         description: Low price for this interval
 *         example: "52621"
 *       volume:
 *         type: number
 *         description: Volume during this interval
 *         example: "16096813"
 *       breakout:
 *         type: object
 *         $ref: '#/definitions/Breakout'
 *         description: Individual holding action
 *   Mover:
 *     type: object
 *     properties:
 *       name:
 *         type: string
 *         description: Symbol for the holding
 *       value:
 *         type: number
 *         description: Percentage change for the time period
 *   Actions:
 *     type: array
 *     items:
 *       $ref: '#/definitions/Action'
 *   Movers:
 *     type: array
 *     items:
 *       $ref: '#/definitions/Mover'
 *   Comparison:
 *     type: object
 *     description: An object with keys for each comparison symbol, and a the portfolios name. The values of each key is an array of tuples (value, date) representing a chart interval.
 *   User:
 *     type: object
 *     properties:
 *       id:
 *         type: string
 *         required: true
 *       active_portfolio:
 *         type: string
 *         description: ID of the users active portfolio
 *         required: true
 *       theme:
 *         type: string
 *         description: Name of this users theme
 *       username:
 *         type: string
 *       email:
 *         type: string
 *   Transaction:
 *     type: object
 *     properties:
 *        date:
 *          type: string
 *          description: Date and time that the transaction was executed.
 *        type:
 *          type: Type of transaction
 *          enum: [SALE, PURCHASE]
 *        quantity:
 *          type: string
 *          description: Quantity of units.
 *        price:
 *          type: string
 *          description: Price paid per unit.
 *        symbol:
 *          type: string
 *          description: Symbol for the holding.
 *        class:
 *          type: string
 *          enum: [stock, crypto, cash]
 *   Portfolio:
 *     type: object
 *     properties:
 *       id:
 *         type: string
 *       user_id:
 *         type: string
 *       createTime:
 *         type: string
 *       transactions:
 *         type: array
 *         items:
 *           $ref: '#/definitions/Transaction'
 *   UploadResponse:
 *     type: object
 *     properties:
 *       data:
 *         type: object
 *         required: true
 *         properties:
 *           transactions:
 *             type: array
 *             description: Array of uploaded transactions.
 *             items:
 *               $ref: '#/definitions/Transaction'
 *           errors:
 *             type: array
 *             description: Errors that occurred while uploading.
 *         items:
 *           type: object
 *           properties:
 *             message:
 *               type: string
 *               description: A descriptive message about what went wrong.
 *   Summary:
 *     type: object
 *     properties:
 *       portfolio_name:
 *         type: string
 *         description: Name of the portfolio.
 *       principal:
 *         type: string
 *         description: Principal amount invested.
 *       change:
 *         type: object
 *         description: Amount changed in the last market day.
 *         properties:
 *           raw:
 *             type: string
 *           percent:
 *             type: string
 *       allTimeChange:
 *         type: object
 *         properties:
 *           raw:
 *             type: string
 *           percent:
 *             type: string
 *       regularMarketPreviousClose:
 *         type: string
 *       regularMarketPrice:
 *         type: string
 *       netBalance:
 *         type: string
 *       realizedGainOrLoss:
 *         type: string
 *   Holding:
 *     type: object
 *     properties:
 *       symbol:
 *         type: string
 *       quantity:
 *         type: number
 *       costBasis:
 *         type: number
 *       gainOrLoss:
 *         type: object
 *         properties:
 *           raw:
 *             type: number
 *           percent:
 *             type: number
 *
 */

/**
 * @swagger
 * /api/v3/portfolios/{id}:
 *   get:
 *     summary: Retrieve a Portfolio by ID.
 *   parameters:
 *     - in: path
 *       name: id
 *       required: true
 *       description: ID of the Portfolio to retrieve.
 *       type: string
 *
 * @param {*} id
 * @returns {Object} Portfolio
 */
const getPortfolioById = (id) => {
  return new Promise((resolve, reject) => {
    var params = {
      TableName: "Portfolio",
      FilterExpression: "(id = :id)",
      ExpressionAttributeValues: {
        ":id": id,
      },
    };

    const onScan = (err, data) => {
      if (err) {
        console.error(
          "Unable to scan the table. Error JSON:",
          JSON.stringify(err, null, 2)
        );
        resolve([]);
      } else {
        resolve(data);
      }
    };
    docClient.scan(params, onScan);
  });
};

const getPortfolioByUser = (id) => {
  var params = {
    TableName: "Portfolio",
    FilterExpression: "(user_id = :user_id)",
    ExpressionAttributeValues: {
      ":user_id": id,
    },
  };

  return new Promise((resolve, reject) => {
    const onScan = (err, data) => {
      if (err) {
        reject(err);
      } else {
        if (data["Items"].length > 0) {
          resolve(
            new Portfolio(
              data.Items[0].id,
              JSON.parse(data.Items[0].transactions)
            )
          );
        }
      }
    };
    docClient.scan(params, onScan);
  });
};

/**
 * @swagger
 * /api/v2/portfolio/breakdown/{id}:
 *   get:
 *     summary: Retrieves the breakdown of a portfolio.
 *   parameters:
 *     - in: path
 *       name: id
 *       required: true
 *       description: ID of the Portfolio to retrieve.
 *       type: string
 * @param {*} id
 * @returns {Object} Breakdown
 */
const getBreakdown = (id) => {
  return new Promise((resolve, reject) => {
    getPortfolioById(id)
      .then((data) => {
        if (data.err) {
          console.error(data.err);
          reject(data);
        }
        const portfolio = new Portfolio(
          data.Items[0].id,
          JSON.parse(data.Items[0].transactions)
        );
        portfolio
          .calcBreakdown()
          .then((bd) => {
            resolve(bd);
          })
          .catch((error) => {
            reject(error);
          });
      })
      .catch((error) => {
        reject(error);
      });
  });
};

/**
 * @swagger
 * /api/v2/portfolio/{id}/movers:
 *  post:
 *    summary: Retrieves the percentage change of each holding in the Portfolio.
 *    consumes:
 *      - application/json
 *    parameters:
 *     - in: path
 *       name: id
 *       description: ID of the Portfolio to retrieve.
 *       required: true
 *       schema:
 *         type: string
 *         example: "271ef7f0-7f22-11ed-8d69-f9f6d36c4def"
 *     - in: body
 *       name: ChartBody
 *       schema:
 *         type: object
 *         required:
 *            - range
 *         properties:
 *           range:
 *             type: string
 *             description: "`1d` `5d` `1mo` `3mo` `6mo` `1y` `5y` `10y` `ytd`"
 *             example: "1d"
 *           interval:
 *             type: string
 *             description: "`1m` `5m` `15m` `1d` `1wk` `1mo`"
 *             example: "5m"
 *    responses:
 *      '200':
 *        description: A list of symbols and its holdings percentage movement in the provided range.
 *        content:
 *          application/json:
 *            schema:
 *              $ref: '#/definitions/Movers'
 *
 */
const getMovers = (id, range, interval) => {
  return new Promise((resolve, reject) => {
    if (!id || !range || !interval) {
      reject("Invalid params");
    }
    getPortfolioById(id)
      .then((data) => {
        if (data.err) {
          console.error(data.err);
          reject(data);
        }
        const portfolio = new Portfolio(
          data.Items[0].id,
          JSON.parse(data.Items[0].transactions)
        );
        portfolio
          .calcMovers(range, interval)
          .then((m) => {
            resolve(m);
          })
          .catch((error) => {
            reject(error);
          });
      })
      .catch((error) => {
        reject(error);
      });
  });
};

/**
 * @swagger
 * /api/v2/portfolio/{id}/action:
 *  post:
 *    summary: Retrieves the price action for the time range in increments of interval. Ignores invalid symbols. Valid symbols are listed on Yahoo Finance.
 *    consumes:
 *      - application/json
 *    parameters:
 *     - in: path
 *       name: id
 *       description: ID of the Portfolio to retrieve.
 *       required: true
 *       schema:
 *         type: string
 *         example: "271ef7f0-7f22-11ed-8d69-f9f6d36c4def"
 *     - in: body
 *       name: ChartBody
 *       schema:
 *         type: object
 *         required:
 *            - range
 *         properties:
 *           range:
 *             type: string
 *             description: "`1d` `5d` `1mo` `3mo` `6mo` `1y` `5y` `10y` `ytd`"
 *             example: "1d"
 *           interval:
 *             type: string
 *             description: "`1m` `5m` `15m` `1d` `1wk` `1mo`"
 *             example: "5m"
 *           benchmark:
 *             type: boolean
 *             description: If true will process action as a benchmark portfolio, which ignores transaction history, and includes the original quote.
 *    responses:
 *      '200':
 *        description: A list of symbols and its holdings percentage movement in the provided range.
 *        content:
 *          application/json:
 *            schema:
 *              $ref: '#/definitions/Movers'
 *
 */
const getPriceAction = (id, range, interval, benchmarkFlag) => {
  return new Promise((resolve, reject) => {
    if (!id || !range || !interval) {
      reject("Invalid params");
    }

    getPortfolioById(id)
      .then((data) => {
        if (data.err) {
          console.error(data.err);
          reject(data);
        }
        const portfolio = new Portfolio(
          data.Items[0].id,
          JSON.parse(data.Items[0].transactions)
        );
        portfolio
          .calcPriceActionParallel(range, interval, true, benchmarkFlag)
          .then((pa) => {
            resolve(pa);
          })
          .catch((error) => {
            reject(error);
          });
      })
      .catch((error) => {
        reject(error);
      });
  });
};

/**
 * @swagger
 * /api/v2/portfolio/{id}/comparison:
 *  post:
 *    summary: Calculates and returns a percentage comparison chart for time range in increments of interval.
 *    consumes:
 *      - application/json
 *    parameters:
 *     - in: path
 *       name: id
 *       description: ID of the Portfolio.
 *       required: true
 *       schema:
 *         type: string
 *         example: "271ef7f0-7f22-11ed-8d69-f9f6d36c4def"
 *     - in: body
 *       name: ChartBody
 *       schema:
 *         type: object
 *         required:
 *            - range
 *         properties:
 *           comparisons:
 *             type: array
 *             description: An array of tickers to compare performance against.
 *             example: ["^GSPC", "^DJI", "^IXIC"]
 *           range:
 *             type: string
 *             description: "`1d` `5d` `1mo` `3mo` `6mo` `1y` `5y` `10y` `ytd`"
 *             example: "1d"
 *           interval:
 *             type: string
 *             description: "`1m` `5m` `15m` `1d` `1wk` `1mo`"
 *             example: "5m"
 *           benchmark:
 *             type: boolean
 *             description: When true ignores transaction dates and measures growth based on current holdings.
 *    responses:
 *      '200':
 *        description: A list of symbols and an array of percentage chart data for the provided range in increments of interval.
 *        content:
 *          application/json:
 *            schema:
 *              $ref: '#/definitions/Comparison'
 *
 */
const getComparison = (id, comparisons, range, interval, benchmark) => {
  return new Promise((resolve, reject) => {
    if (!id || !range || !interval) {
      reject("Invalid params");
    }
    getPortfolioById(id)
      .then((data) => {
        if (data.err) {
          console.error(data.err);
          reject(data);
        }
        const portfolio = new Portfolio(
          data.Items[0].id,
          JSON.parse(data.Items[0].transactions),
          data.Items[0].portfolio_name
        );

        portfolio
          .calcComparisonParallelV2(comparisons, range, interval, benchmark)
          .then((comparison) => {
            resolve(comparison);
          })
          .catch((error) => {
            reject(error);
          });
      })
      .catch((error) => {
        reject(error);
      });
  });
};

/**
 *
 * @param {*} id
 * @returns
 */
const getAvailableRanges = (id) => {
  return new Promise((resolve, reject) => {
    getPortfolioById(id)
      .then((data) => {
        if (data.err) {
          console.error(data.err);
          reject(data);
        }
        const portfolio = new Portfolio(
          data.Items[0].id,
          JSON.parse(data.Items[0].transactions),
          data.Items[0].portfolio_name
        );
        resolve(portfolio.getAvailableRanges());
      })
      .catch((error) => {
        reject(error);
      });
  });
};

/**
 *
 * @param {*} id
 * @returns
 */
const save = (portfolio) => {
  return new Promise((resolve, reject) => {
    var params = {
      TableName: "Portfolio",
      Key: {
        id: portfolio.id,
      },
      UpdateExpression: "set transactions = :transactions",
      ExpressionAttributeValues: {
        ":transactions": JSON.stringify(portfolio.transactions),
      },
      ReturnValues: "UPDATED_NEW",
    };

    docClient.update(params, (err, data) => {
      if (err) {
        console.error(
          "Unable to update item. Error JSON:",
          JSON.stringify(err, null, 2)
        );
        reject(err);
      } else {
        resolve(data);
      }
    });
  });
};

const PortfolioService = {
  upsert: (req, res, next) => {
    if (!req.body.id) {
      res.send({
        error: {
          message: "Invalid params",
        },
      });
      return next();
    } else {
      var params = {
        TableName: "Portfolio",
        FilterExpression: "(id = :id)",
        ExpressionAttributeValues: {
          ":id": req.body.id,
        },
      };

      const onScan = (err, data) => {
        if (err) {
        } else {
          if (data["Items"].length > 0) {
            var existing = data["Items"][0];
            var params = {
              TableName: "Portfolio",
              Key: {
                id: existing.id,
              },
              UpdateExpression: "set transactions = :transactions",
              ExpressionAttributeValues: {
                ":transactions": req.body.transactions,
              },
              ReturnValues: "UPDATED_NEW",
            };

            docClient.update(params, function (err, data) {
              if (err) {
                console.error(
                  "Unable to update item. Error JSON:",
                  JSON.stringify(err, null, 2)
                );
              } else {
                res.send(data);
              }
            });
          } else {
            const portfolio = {
              id: uuidv1(),
              user_id: req.body.userId,
              transactions: req.body.transactions,
              createTime: new Date().getTime(),
            };

            var params = {
              TableName: "Portfolio",
              Item: {
                id: { S: portfolio.id },
                user_id: { S: portfolio.user_id },
                transactions: { S: portfolio.transactions },
                createTime: { N: new Date().getTime().toString() },
              },
            };

            // Call DynamoDB to add the item to the table
            ddb.putItem(params, (err, data) => {
              if (err) {
                console.log("Error", err);
              } else {
                res.send(data);
                return next();
              }
            });
          }
        }
      };
      docClient.scan(params, onScan);
    }
  },
  /**
   * @swagger
   * /api/v3/portfolios:
   *  post:
   *    summary: Creates a new portfolio.
   *    consumes:
   *      - application/json
   *    parameters:
   *     - in: body
   *       name: CreatePortfolioBody
   *       schema:
   *         type: object
   *         required:
   *            - userId
   *         properties:
   *           userId:
   *             type: string
   *             description: "Id of the user to link this portfolio to"
   *           transactions:
   *             type: array
   *             items:
   *               $ref: '#/definitions/Transaction'
   *    responses:
   *      '200':
   *        description: The newly created portfolio.
   *        content:
   *          application/json:
   *            schema:
   *              $ref: '#/definitions/Portfolio'
   */
  add: (req, res, next) => {
    if (!req.body.userId) {
      res.send({
        error: {
          message: "Invalid params",
        },
      });
      return next();
    } else {
      const portfolio = {
        id: uuidv1(),
        user_id: req.body.userId,
        transactions: JSON.stringify([]),
      };

      var params = {
        TableName: "Portfolio",
        Item: {
          id: { S: portfolio.id },
          user_id: { S: portfolio.user_id },
          transactions: { S: portfolio.transactions },
          createTime: { N: new Date().getTime().toString() },
        },
      };

      // Call DynamoDB to add the item to the table
      ddb.putItem(params, (err, data) => {
        if (err) {
          console.log("Error", err);
        } else {
          getPortfolioById(portfolio.id).then((data) => {
            res.send(data.Items[0]);
            next();
          });
        }
      });
    }
  },
  update: (req, res, next) => {
    if (!req.params.id) {
      res.send({
        error: {
          message: "Invalid params",
        },
      });
      return next();
    } else {
      var params = {
        TableName: "Portfolio",
        FilterExpression: "(id = :id)",
        ExpressionAttributeValues: {
          ":id": req.params.id,
        },
      };

      const onScan = (err, data) => {
        if (err) {
        } else {
          if (data["Items"].length > 0) {
            var existing = data["Items"][0];
            var params = {
              TableName: "Portfolio",
              Key: {
                id: existing.id,
              },
              UpdateExpression: "set portfolio_name = :portfolio_name",
              ExpressionAttributeValues: {
                ":portfolio_name": req.body.portfolio_name,
              },
              ReturnValues: "UPDATED_NEW",
            };

            docClient.update(params, function (err, data) {
              if (err) {
                console.error(
                  "Unable to update item. Error JSON:",
                  JSON.stringify(err, null, 2)
                );
              } else {
                res.send(data);
              }
            });
          }
        }
      };
      docClient.scan(params, onScan);
    }
  },
  delete: (req, res, next) => {
    if (!req.params.id) {
      res.send({
        error: {
          message: "Invalid params",
        },
      });
      return next();
    } else {
      var params = {
        Key: {
          id: {
            S: req.params.id,
          },
        },
        TableName: "Portfolio",
      };

      // Call DynamoDB to add the item to the table
      ddb.deleteItem(params, (err, data) => {
        if (err) {
          console.log("Error", err);
        } else {
          res.send(data);
          return next();
        }
      });
    }
  },
  /**
   * @swagger
   * /api/v3/portfolios/{id}/transaction:
   *  post:
   *    summary: Removes a transaction from portfolio.
   *    consumes:
   *      - application/json
   *    parameters:
   *     - in: path
   *       name: id
   *       required: true
   *       description: ID of the Portfolio.
   *     - in: body
   *       name: transaction
   *       schema:
   *         type: object
   *         $ref: '#/definitions/Transaction'
   *    responses:
   *      '200':
   *        description: The new portfolio.
   *        content:
   *          application/json:
   *            schema:
   *              $ref: '#/definitions/Portfolio'
   */
  removeTransaction: (req, res, next) => {
    if (!req.params.id || !req.body.transaction) {
      res.send({
        error: {
          message: "Invalid params",
        },
      });
      return next();
    } else {
      var params = {
        TableName: "Portfolio",
        FilterExpression: "(id = :id)",
        ExpressionAttributeValues: {
          ":id": req.params.id,
        },
      };

      const onScan = (err, data) => {
        if (err) {
          console.error(
            "Unable to scan the table. Error JSON:",
            JSON.stringify(err, null, 2)
          );
          res.send([]);
        } else {
          if (data["Items"].length > 0) {
            const portfolios = data.Items.map((item) => {
              return {
                ...item,
                transactions: JSON.parse(item.transactions),
              };
            });
            const portfolio = new Portfolio(
              portfolios[0].id,
              portfolios[0].transactions,
              portfolios[0].portfolio_name
            );
            portfolio.removeTransaction(req.body.transaction).then(() => {
              PortfolioService.save(portfolio)
                .then((response) => {
                  res.send(portfolio);
                  return next();
                })
                .catch((err) => {
                  res.send({
                    error: {
                      message: err,
                    },
                  });
                  return next();
                });
            });
          } else {
            res.send({
              error: {
                message: "Cannot find portfolio",
              },
            });
            return next();
          }
        }
      };
      docClient.scan(params, onScan);
    }
  },
  getById: (req, res, next) => {
    if (!req.params.id) {
      res.send({
        error: {
          message: "Invalid params",
        },
      });
      return next();
    } else {
      var params = {
        TableName: "Portfolio",
        FilterExpression: "(id = :id)",
        ExpressionAttributeValues: {
          ":id": req.params.id,
        },
      };

      const onScan = (err, data) => {
        if (err) {
          console.error(
            "Unable to scan the table. Error JSON:",
            JSON.stringify(err, null, 2)
          );
          res.send([]);
        } else {
          if (data["Items"].length > 0) {
            const portfolios = data.Items.map((item) => {
              return {
                ...item,
                transactions: JSON.parse(item.transactions),
              };
            });
            const portfolio = new Portfolio(
              portfolios[0].id,
              portfolios[0].transactions,
              portfolios[0].portfolio_name
            );
            res.send(portfolio);
            return next();
          } else {
            res.send(null);
            return next();
          }
        }
      };
      docClient.scan(params, onScan);
    }
  },
  get: (req, res, next) => {
    if (!req.params.userId) {
      res.send({
        error: {
          message: "Invalid params",
        },
      });
      return next();
    } else {
      var params = {
        TableName: "Portfolio",
        FilterExpression: "(user_id = :user_id)",
        ExpressionAttributeValues: {
          ":user_id": req.params.userId,
        },
      };

      const onScan = (err, data) => {
        if (err) {
          console.error(
            "Unable to scan the table. Error JSON:",
            JSON.stringify(err, null, 2)
          );
          res.send([]);
        } else {
          if (data["Items"].length > 0) {
            const portfolios = data.Items.map((item) => ({
              ...item,
              transactions: JSON.parse(item.transactions),
            }));
            const portfolio = new Portfolio(
              portfolios[0].id,
              portfolios[0].transactions,
              portfolios[0].portfolio_name
            );
            res.send(portfolio);
          } else {
            res.send(null);
          }
          return next();
        }
      };
      docClient.scan(params, onScan);
    }
  },
  /**
   * Gets all portfolios for a user
   * req.body: { userId: string }
   * @param {*} req
   * @param {*} res
   * @param {*} next
   */
  allByUser: (req, res, next) => {
    if (!req.params.userId) {
      res.send({
        error: {
          message: "Invalid params",
        },
      });
      return next();
    } else {
      var params = {
        TableName: "Portfolio",
        FilterExpression: "(user_id = :user_id)",
        ExpressionAttributeValues: {
          ":user_id": req.params.userId,
        },
      };

      const onScan = (err, data) => {
        if (err) {
          console.error(
            "Unable to scan the table. Error JSON:",
            JSON.stringify(err, null, 2)
          );
          res.send([]);
        } else {
          const portfolios = data.Items.map((item) => ({
            ...item,
            transactions: JSON.parse(item.transactions),
          }));
          const portfolio = new Portfolio(
            portfolios[0].id,
            portfolios[0].transactions,
            portfolios[0].portfolio_name
          );
          res.send(portfolios);
          return next();
        }
      };
      docClient.scan(params, onScan);
    }
  },

  /**
   * @swagger
   * /api/v2/portfolio/{id}/summary:
   *   get:
   *     summary: Get a summary of a portfolio.
   *     parameters:
   *     - in: path
   *       name: id
   *       required: true
   *       description: ID of the Portfolio.
   *       schema:
   *         type: string
   *         example: "271ef7f0-7f22-11ed-8d69-f9f6d36c4def"
   *     responses:
   *       '200':
   *         description: A summary of the portfolio.
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/definitions/Summary'
   */
  summary: (req, res, next) => {
    if (!req.params.id) {
      res.send({
        error: {
          message: "Invalid params",
        },
      });
      return next();
    } else {
      if (summaryCache.get(req.params.id)) {
        // Return the cached result

        res.send(summaryCache.get(req.params.id));
        return next();
      }

      var params = {
        TableName: "Portfolio",
        FilterExpression: "(id = :id)",
        ExpressionAttributeValues: {
          ":id": req.params.id,
        },
      };

      const onScan = (err, data) => {
        if (err) {
          console.error(
            "Unable to scan the table. Error JSON:",
            JSON.stringify(err, null, 2)
          );
          res.send([]);
        } else {
          const portfolios = data.Items.map((item) => ({
            ...item,
            transactions: JSON.parse(item.transactions),
          }));
          const portfolio = new Portfolio(
            portfolios[0].id,
            portfolios[0].transactions,
            portfolios[0].portfolio_name
          );

          portfolio.summary.then((summary) => {
            // Cache the result for subsequent calls
            summaryCache.save(req.params.id, summary);

            res.send(summary);
            return next();
          });
        }
      };
      docClient.scan(params, onScan);
    }
  },

  /**
   * @swagger
   * /api/v2/portfolios/{id}/{symbol}:
   *   get:
   *     summary: Get a holding in a portfolio.
   *     parameters:
   *     - in: path
   *       name: id
   *       required: true
   *       description: ID of the Portfolio.
   *       schema:
   *         type: string
   *         example: "271ef7f0-7f22-11ed-8d69-f9f6d36c4def"
   *     - in: path
   *       name: symbol
   *       required: true
   *       description: Symbol of the holding to retrieve.
   *       schema:
   *         type: string
   *         example: "AAPL"
   *     responses:
   *       '200':
   *         description: Holding details.
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/definitions/Holding'
   */
  holding: async (req, res, next) => {
    if (!req.params.id || !req.params.symbol) {
      res.send({
        error: {
          message: "Invalid params",
        },
      });
      return next();
    } else {
      var params = {
        TableName: "Portfolio",
        FilterExpression: "(id = :id)",
        ExpressionAttributeValues: {
          ":id": req.params.id,
        },
      };

      const onScan = async (err, data) => {
        if (err) {
          console.error(
            "Unable to scan the table. Error JSON:",
            JSON.stringify(err, null, 2)
          );
          res.send([]);
        } else {
          const portfolios = data.Items.map((item) => ({
            ...item,
            transactions: JSON.parse(item.transactions),
          }));
          const portfolio = new Portfolio(
            portfolios[0].id,
            portfolios[0].transactions,
            portfolios[0].portfolio_name
          );
          let holding = await portfolio.getHolding(req.params.symbol);
          res.send(holding);
          return next();
        }
      };
      docClient.scan(params, onScan);
    }
  },

  breakdown: (req, res, next) => {
    if (!req.params.id) {
      res.send({
        error: {
          message: "Invalid params",
        },
      });
      return next();
    } else {
      getBreakdown(req.params.id)
        .then((breakdown) => {
          res.send(breakdown);
          return next();
        })
        .catch((error) => {
          res.send(error);
          return next();
        });
    }
  },
  movers: (req, res, next) => {
    if (!req.params.id || !req.body.range || !req.body.interval) {
      res.send({
        error: {
          message: "Invalid params",
        },
      });
      return next();
    } else {
      getMovers(req.params.id, req.body.range, req.body.interval)
        .then((movers) => {
          res.send(movers);
          return next();
        })
        .catch((error) => {
          console.log(error);
          res.send(error);
          return next();
        });
    }
  },
  action: (req, res, next) => {
    if (!req.params.id || !req.body.range || !req.body.interval) {
      res.send({
        error: {
          message: "Invalid params",
        },
      });
      return next();
    } else {
      // ID for cached result
      const cacheId = `${req.params.id}-${req.body.range}-${req.body.interval}-${req.body.benchmark}`;

      if (actionCache.get(cacheId)) {
        // Result is in the cache, return it

        res.send(actionCache.get(cacheId));
        return next();
      } else {
        getPriceAction(
          req.params.id,
          req.body.range,
          req.body.interval,
          req.body.benchmark
        )
          .then((pa) => {
            // Save the result in the action cache
            actionCache.save(cacheId, pa);

            res.send(pa);
            return next();
          })
          .catch((error) => {
            console.log(error);
            res.send(error);
            return next();
          });
      }
    }
  },
  comparison: (req, res, next) => {
    if (!req.params.id || !req.body.range || !req.body.interval) {
      res.send({
        error: {
          message: "Invalid params",
        },
      });
      return next();
    } else {
      getComparison(
        req.params.id,
        req.body.comparisons,
        req.body.range,
        req.body.interval,
        req.body.benchmark
      )
        .then((comparison) => {
          res.send(comparison);
          return next();
        })
        .catch((error) => {
          console.log(error);
          res.send(error);
          return next();
        });
    }
  },
  availableRanges: (req, res, next) => {
    if (!req.params.id) {
      res.send({
        error: {
          message: "Invalid params",
        },
      });
      return next();
    } else {
      getAvailableRanges(req.params.id)
        .then((availableRanges) => {
          res.send(availableRanges);
          return next();
        })
        .catch((error) => {
          console.log(error);
          res.send(error);
          return next();
        });
    }
  },
  upload: async (req, res, next) => {
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
  },
  preview: async (req, res, next) => {
    var form = new formidable.IncomingForm();
    previewTransactionsFromCSV(req, form)
      .then((data) => {
        res.write(JSON.stringify(data));
        res.end();
      })
      .catch((err) => {
        res.write(JSON.stringify(err));
        res.end();
      });
  },
  bulkAdd: async (req, res, next) => {
    if (
      !req.params.id ||
      !req.body.transactions ||
      !req.body.transactions.length
    ) {
      res.send({
        error: {
          message: "Invalid params",
        },
      });
      res.end();
    } else {
      bulkAddTransactions(req.params.id, req.body.transactions)
        .then((data) => {
          if (data && !data.error) {
            getPortfolioById(req.params.id)
              .then((data) => {
                res.send(data.Items[0]);
              })
              .catch((err) => {
                res.send({
                  error: {
                    message: "Failed to get portfolio after adding",
                  },
                });
                res.end();
              });
          }
        })
        .catch((err) => {
          res.send({
            error: {
              message: "Failed to add all transactions",
              systemError: err,
            },
          });
          res.end();
        });
    }
  },
  save: save,
  getPortfolioById: getPortfolioById,
  getPortfolioByUser: getPortfolioByUser,
};

module.exports = PortfolioService;
