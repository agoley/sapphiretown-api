var unirest = require("unirest");

let AWS = require("aws-sdk");
const { v1: uuidv1 } = require("uuid");
const bcrypt = require("bcrypt");
const { DataPipeline } = require("aws-sdk");
const Portfolio = require("../common/portfolio");

AWS.config.update({
  region: "us-east-1",
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

var ddb = new AWS.DynamoDB({ apiVersion: "2012-08-10" });
var docClient = new AWS.DynamoDB.DocumentClient();

const getPortfolio = (userId) => {
  var params = {
    TableName: "Portfolio",
    FilterExpression: "(user_id = :user_id)",
    ExpressionAttributeValues: {
      ":user_id": userId,
    },
  };

  return new Promise((resolve, reject) => {
    const onScan = (err, data) => {
      if (err) {
        console.error(
          "Unable to scan the table. Error JSON:",
          JSON.stringify(err, null, 2)
        );
        resolve(null);
      } else {
        if (data["Items"].length > 0) {
          var portfolio = data["Items"][0];
          resolve(portfolio);
        } else {
          resolve(null);
        }
      }
    };
    docClient.scan(params, onScan);
  });
};

const upsert = (history) => {
  var params = {
    TableName: "History",
    FilterExpression: "(user_id = :user_id)",
    ExpressionAttributeValues: {
      ":user_id": history.user_id,
    },
  };

  return new Promise((resolve, reject) => {
    const onScan = (err, data) => {
      if (err) {
      } else {
        if (data["Items"].length > 0) {
          var existing = data["Items"][0];
          var params = {
            TableName: "History",
            Key: {
              id: existing.id,
            },
            UpdateExpression: "set #v = :values",
            ExpressionAttributeValues: {
              ":values": history.values,
            },
            ExpressionAttributeNames: {
              "#v": "values"
            },
            ReturnValues: "UPDATED_NEW",
          };

          docClient.update(params, (err, data) => {
            if (err) {
              reject(err);
            } else {
              resolve(data);
            }
          });
        } else {
          var params = {
            TableName: "History",
            Item: {
              id: { S: history.id },
              user_id: { S: history.user_id },
              values: { S: history.values },
            },
          };

          // Call DynamoDB to add the item to the table
          ddb.putItem(params, (err, data) => {
            if (err) {
              reject(err);
            } else {
              resolve(data);
            }
          });
        }
      }
    };
    docClient.scan(params, onScan);
  });
};

const getByUser = (userId) => {
  var params = {
    TableName: "History",
    FilterExpression: "(user_id = :user_id)",
    ExpressionAttributeValues: {
      ":user_id": userId,
    },
  };

  return new Promise((resolve, reject) => {
    docClient.scan(params, (err, data) => {
      if (err) {
        reject(err);
      } else {
        if (data.Items.length > 0) {
          resolve(data.Items[0]);
        } else {
          resolve(null);
        }
      }
    });
  });
};

const record = (userId) => {
  return new Promise((resolve, reject) => {
    getPortfolio(userId).then((data) => {
      if (!data) {
        reject({
          message: "Unable to get portfolio for user with id: " + userId,
        });
      }
      const portfolio = new Portfolio(data.id, JSON.parse(data.transactions));
      portfolio.value.then((value) => {
        getByUser(userId).then((history) => {
          if (history) {
            // TODO: abstract this.
            values = JSON.parse(history.values);
            values.push({
              timestamp: new Date(),
              value: value,
            });
            history.values = JSON.stringify(values);
          } else {
            history = {
              id: uuidv1(),
              user_id: userId,
              values: JSON.stringify([{ timestamp: new Date(), value: value }]),
            };
          }
          upsert(history);
          resolve();
        });
      });
    });
  });
};

const HistoryService = {
  upsert: upsert,
  record: record,
};

module.exports = HistoryService;
