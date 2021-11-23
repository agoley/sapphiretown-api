const Portfolio = require("./portfolio");
let AWS = require("aws-sdk");
const { v1: uuidv1 } = require("uuid");

AWS.config.update({
  region: "us-east-1",
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

var ddb = new AWS.DynamoDB({ apiVersion: "2012-08-10" });
var docClient = new AWS.DynamoDB.DocumentClient();

class Reducer {
  constructor() {
    this.watching = [];
  }

  handle(message, wss) {
    const watcher = this.watching.find((i) => i.id === message.user.id);

    if (watcher) {
      // Same user new session.
      watcher.portfolio.stop();
      watcher.page = message.page;
      watcher.portfolio.watch(wss, message.page, message.context);
    } else {
      var userLookupParams = {
        TableName: "User",
        FilterExpression: "(id = :user_id)",
        ExpressionAttributeValues: {
          ":user_id": message.user.id,
        },
      };

      const onUserLookupScan = (err, data) => {
        if (err) {
          console.error(
            "Unable to scan the table. Error JSON:",
            JSON.stringify(err, null, 2)
          );
          console.error("There was en error looking up User.");
        } else {
          if (data["Items"].length > 0) {
            const user = data["Items"][0];

            if (user.plan_name === "PRO") {
              docClient.scan(
                {
                  TableName: "Portfolio",
                  FilterExpression: "(#user_id = :user_id)",
                  ExpressionAttributeNames: { "#user_id": "user_id" },
                  ExpressionAttributeValues: {
                    ":user_id": message.user.id,
                  },
                },
                (err, portfolios) => {
                  if (err || portfolios.Items.length === 0) {
                    console.log(err);
                  } else {
                    const portfolio = new Portfolio(
                      portfolios.Items[0].id,
                      JSON.parse(portfolios.Items[0].transactions)
                    );
                    portfolio.watch(wss, message.page, message.context);
                    this.watching.push({
                      id: message.user.id,
                      page: message.page,
                      portfolio: portfolio,
                    });
                  }
                }
              );
            }
          }
        }
      };
      docClient.scan(userLookupParams, onUserLookupScan);
    }
  }
}

module.exports = Reducer;
