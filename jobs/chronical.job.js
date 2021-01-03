const Portfolio = require("../common/portfolio");
let AWS = require("aws-sdk");

AWS.config.update({
  region: "us-east-1",
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

var ddb = new AWS.DynamoDB({ apiVersion: "2012-08-10" });
var docClient = new AWS.DynamoDB.DocumentClient();

/**
 * Chornical users portfolio history.
 */
const chronical = () => {
  let params;

  // Get all users.
  params = {
    TableName: "User",
  };

  docClient.scan(params, function (err, data) {
    if (err) {
      console.error("Unable to query. Error:", JSON.stringify(err, null, 2));
    } else {
      console.log("Query succeeded.");
      // Iterate users.
      data.Items.forEach(function (item) {
        // Get or create empty history record for user.

        docClient.scan(
          {
            TableName: "History",
            FilterExpression: "(#user_id = :user_id)",
            ExpressionAttributeNames: { "#user_id": "user_id" },
            ExpressionAttributeValues: {
              ":user_id": item.id,
            },
          },
          (err, data) => {
            if (err) {
              console.log(err);
            } else {
              docClient.scan(
                {
                  TableName: "Portfolio",
                  FilterExpression: "(#user_id = :user_id)",
                  ExpressionAttributeNames: { "#user_id": "user_id" },
                  ExpressionAttributeValues: {
                    ":user_id": item.id,
                  },
                },
                (err, data) => {
                  if (err || data.Items.length === 0) {
                    // TODO: handle this error.
                  } else {
                    const portfolio = new Portfolio(
                      data.Items[0].id,
                      JSON.parse(data.Items[0].transactions)
                    );
                    portfolio.calcValue().then((value) => {
                      console.log(
                        `${item.username} has a portfolio with value ${value}`
                      );
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

  // Get current value and add.

  // Save history value.
};

module.exports = chronical;
