let AWS = require("aws-sdk");
const { v1: uuidv1 } = require("uuid");
const Portfolio = require("../common/portfolio");

AWS.config.update({
  region: "us-east-1",
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

var ddb = new AWS.DynamoDB({ apiVersion: "2012-08-10" });
var docClient = new AWS.DynamoDB.DocumentClient();

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
 *   CandleModel:
 *     type: object
 *     properties:
 *       date:
 *         type: Date
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
 *   BreakoutModel:
 *     type: object
 *     properties:
 *       symbol:
 *         type: string
 *         description: Ticker for this holding
 *         example: "AAPL"
 *       candle:
 *         type: object
 *         $ref: '#/definitions/CandleModel'
 *   ActionModel:
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
 *         $ref: '#/definitions/BreakoutModel'
 *         description: Individual holding action
 *   MoverModel:
 *     type: object
 *     properties:
 *       name:
 *         type: string
 *         descriptions: Symbol for the holding
 *       value:
 *         type: number
 *         description: Percentage change for the time period
 *   ActionArray:
 *     type: array
 *     items:
 *       $ref: '#/definitions/ActionModel'
 *   MoversArray:
 *     type: array
 *     items:
 *       $ref: '#/definitions/MoverModel'
 *   ComparisonResponse:
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
 *       errors:
 *         type: array
 *         description: Errors that occurred while uploading.
 *         items:
 *           type: object
 *           properties:
 *             message:
 *               type: string
 *               description: A descriptive message about what went wrong.
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
 *              $ref: '#/definitions/MoversArray'
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
 *    summary: Retrieves the price action for the time range in increments of interval.
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
 *              $ref: '#/definitions/MoversArray'
 *
 */
const getPriceAction = (id, range, interval) => {
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
          .calcPriceActionParallel(range, interval, true)
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
 *    responses:
 *      '200':
 *        description: A list of symbols and an array of percentage chart data for the provided range in increments of interval.
 *        content:
 *          application/json:
 *            schema:
 *              $ref: '#/definitions/ComparisonResponse'
 *
 */
const getComparison = (id, comparisons, range, interval) => {
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
          .calcComparisonParallel(comparisons, range, interval)
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
   *           range:
   *             userId: string
   *             description: "Id of the user to link this portfolio too"
   *
   */
  add: (req, res, next) => {
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
        res.send(data);
        return next();
      }
    });
  },
  update: (req, res, next) => {
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
  },
  delete: (req, res, next) => {
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
  },
  getById: (req, res, next) => {
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
  },
  get: (req, res, next) => {
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
  },
  /**
   * Gets all portfolios for a user
   * req.body: { userId: string }
   * @param {*} req
   * @param {*} res
   * @param {*} next
   */
  allByUser: (req, res, next) => {
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
  },
  summary: (req, res, next) => {
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
          res.send(summary);
          return next();
        });
      }
    };
    docClient.scan(params, onScan);
  },
  breakdown: (req, res, next) => {
    getBreakdown(req.params.id)
      .then((breakdown) => {
        res.send(breakdown);
        return next();
      })
      .catch((error) => {
        res.send(error);
        return next();
      });
  },
  movers: (req, res, next) => {
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
  },
  action: (req, res, next) => {
    getPriceAction(req.params.id, req.body.range, req.body.interval)
      .then((pa) => {
        res.send(pa);
        return next();
      })
      .catch((error) => {
        console.log(error);
        res.send(error);
        return next();
      });
  },
  comparison: (req, res, next) => {
    getComparison(
      req.params.id,
      req.body.comparisons,
      req.body.range,
      req.body.interval
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
  },
  availableRanges: (req, res, next) => {
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
  },
  save: save,
  getPortfolioById: getPortfolioById,
};

module.exports = PortfolioService;
