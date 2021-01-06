let AWS = require("aws-sdk");
const { v1: uuidv1 } = require("uuid");
const bcrypt = require("bcrypt");
const { DataPipeline } = require("aws-sdk");
const HistoryService = require("./history.service");

AWS.config.update({
  region: "us-east-1",
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

var ddb = new AWS.DynamoDB({ apiVersion: "2012-08-10" });
var docClient = new AWS.DynamoDB.DocumentClient();

const PortfolioService = {
  upsert: (req, res, next) => {
    var params = {
      TableName: "Portfolio",
      FilterExpression: "(user_id = :user_id)",
      ExpressionAttributeValues: {
        ":user_id": req.body.userId,
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
              HistoryService.record(req.params.userId).then((res) => {});
              res.send(data);
            }
          });
        } else {
          const portfolio = {
            id: uuidv1(),
            user_id: req.body.userId,
            transactions: req.body.transactions,
          };

          var params = {
            TableName: "Portfolio",
            Item: {
              id: { S: portfolio.id },
              user_id: { S: portfolio.user_id },
              transactions: { S: portfolio.transactions },
            },
          };

          // Call DynamoDB to add the item to the table
          ddb.putItem(params, (err, data) => {
            if (err) {
              console.log("Error", err);
            } else {
              HistoryService.record(req.params.userId).then((res) => {});
              res.send(data);
              return next();
            }
          });
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
          var portfolio = JSON.parse(data["Items"][0].transactions);
          portfolio = portfolio.map((p) => {
            p.date = new Date(p.date);
            return p;
          });
          res.send(portfolio);
        } else {
          res.send([]);
        }
        return next();
      }
    };
    docClient.scan(params, onScan);
  },
};

module.exports = PortfolioService;
