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

const getMovers = (id, range, interval) => {
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

const getPriceAction = (id, range, interval) => {
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
          .calcPriceAction(range, interval, true)
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

const getComparison = (id, comparisons, range, interval) => {
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
        portfolio
          .calcComparison(comparisons, range, interval)
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
};

module.exports = PortfolioService;
