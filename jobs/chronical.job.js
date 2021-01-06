const Portfolio = require("../common/portfolio");
const HistoryService = require("../services/history.service");
let AWS = require("aws-sdk");
const { v1: uuidv1 } = require("uuid");

AWS.config.update({
  region: "us-east-1",
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

var ddb = new AWS.DynamoDB({ apiVersion: "2012-08-10" });
var docClient = new AWS.DynamoDB.DocumentClient();

/**
 * Loops through all users adding the current value to their history.
 */
const chronical = () => {
  let params;

  // Get all users.
  params = {
    TableName: "User",
  };

  docClient.scan(params, function (err, users) {
    if (err) {
      console.error("Unable to query. Error:", JSON.stringify(err, null, 2));
    } else {
      console.log("Query succeeded.");
      // Iterate users.
      users.Items.forEach(function (user) {
        // Get or create empty history record for user.

        docClient.scan(
          {
            TableName: "History",
            FilterExpression: "(#user_id = :user_id)",
            ExpressionAttributeNames: { "#user_id": "user_id" },
            ExpressionAttributeValues: {
              ":user_id": user.id,
            },
          },
          (err, histories) => {
            if (err) {
              console.log(err);
            } else {
              let history = histories.Items[0];
              docClient.scan(
                {
                  TableName: "Portfolio",
                  FilterExpression: "(#user_id = :user_id)",
                  ExpressionAttributeNames: { "#user_id": "user_id" },
                  ExpressionAttributeValues: {
                    ":user_id": user.id,
                  },
                },
                (err, portfolios) => {
                  if (err || portfolios.Items.length === 0) {
                    // TODO: handle this error.
                  } else {
                    const portfolio = new Portfolio(
                      portfolios.Items[0].id,
                      JSON.parse(portfolios.Items[0].transactions)
                    );
                    // Get current value and add.
                    portfolio.calcValue().then((value) => {
                      if (!history) {
                        history = {
                          id: uuidv1(),
                          user_id: user.id,
                          values: [
                            { timestamp: new Date(), value: value.toFixed(2) },
                          ],
                        };
                      } else {
                        history.values = JSON.parse(history.values).push(value);
                      }

                      // TOOD: abstract this translation.
                      history.values = JSON.stringify(history.values);
                      // Save history value.
                      HistoryService.upsert(history).then((res) => {});
                    });
                  }
                }
              );
            }
          }
        );
      });
    }
  });
};

module.exports = chronical;
