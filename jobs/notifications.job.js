let AWS = require("aws-sdk");
const UserService = require("../services/user.service");
const PortfolioService = require("../services/portfolio.service");
const StockService = require("../services/stock.service");
const webPush = require("web-push");

AWS.config.update({
  region: "us-east-1",
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

var ddb = new AWS.DynamoDB({ apiVersion: "2012-08-10" });
var docClient = new AWS.DynamoDB.DocumentClient();

if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
  console.log(
    "You must set the VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY " +
      "environment variables. You can use the following ones:"
  );
  console.log(webPush.generateVAPIDKeys());
}

// Set the keys used for encrypting the push messages.
webPush.setVapidDetails(
  "https://ezfol.io/",
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// Send notification to the push service. Remove the subscription from the
// `subscriptions` array if the  push service responds with an error.
// Subscription has been cancelled or expired.
export const sendNotification = (subscription, title, icon) => {
  webPush
    .sendNotification(
      subscription,
      JSON.stringify({
        title: title,
        tag: new Date().getTime(),
        icon: icon,
      })
    )
    .then(() => {
      console.log(
        "Push Application Server - Notification sent to " +
          subscription.endpoint
      );
    })
    .catch(() => {
      console.log(
        "ERROR in sending Notification, endpoint " + subscription.endpoint
      );
    });
};

const notifications = async () => {
  let params;

  // Get all PushSubscriptions
  params = {
    TableName: "PushSubscription",
  };

  docClient.scan(params, function (err, subscriptions) {
    if (err) {
      console.error("Unable to query. Error:", JSON.stringify(err, null, 2));
    } else {
      // Iterate subscriptions
      subscriptions.Items.forEach(async (subscription) => {
        let portfolio = await PortfolioService.getPortfolioByUser(
          subscription.user_id
        );

        let user = await UserService.getUserById(subscription.user_id);

        if (
          user.preferences &&
          user.preferences.notifications &&
          user.preferences.notifications.largeChange
        ) {
          const symbols = portfolio.holdings.map((h) =>
            h.class === "stock"
              ? h.symbol
              : h.symbol.includes("-USD")
              ? h.symbol
              : `${h.symbol}-USD`
          );

          let quotes = await StockService.getQuote(symbols);

          try {
            if (quotes.quoteResponse && quotes.quoteResponse.length) {
              quotes.quoteResponse.result.forEach((q) => {
                const userAlreadyNotifiedOfChange =
                  user.preferences.largeChangeLastUpdateTimes &&
                  user.preferences.largeChangeLastUpdateTimes[q.symbol] &&
                  new Date(
                    user.preferences.largeChangeLastUpdateTimes[q.symbol]
                  ).setHours(0, 0, 0, 0) === new Date().setHours(0, 0, 0, 0);

                if (
                  !userAlreadyNotifiedOfChange &&
                  Math.abs(q.regularMarketChangePercent) >= 5
                ) {
                  sendNotification(
                    JSON.parse(subscription.push_subscription),
                    `${q.symbol} | ${q.regularMarketChangePercent.toFixed(
                      2
                    )}% today`,
                    q.regularMarketChangePercent > 0
                      ? "notification-icon-up.png"
                      : "notification-icon-down.png"
                  );
                  const largeChangeLastUpdateTimes = user.preferences
                    .largeChangeLastUpdateTimes
                    ? user.preferences.largeChangeLastUpdateTimes
                    : {};
                  largeChangeLastUpdateTimes[q.symbol] = new Date().getTime();
                  user.preferences.largeChangeLastUpdateTimes =
                    largeChangeLastUpdateTimes;
                  UserService.updateUser(user);
                }
              });
            }
          } catch (err) {
            console.log(err);
          }
        }

        if (
          user.preferences &&
          user.preferences.notifications &&
          user.preferences.notifications.dividends
        ) {
          const symbols = portfolio.holdings.map((h) =>
            h.class === "stock"
              ? h.symbol
              : h.symbol.includes("-USD")
              ? h.symbol
              : `${h.symbol}-USD`
          );

          try {
            symbols.forEach(async (s) => {
              const summary = await StockService.getQuoteSummary(s);

              if (
                user.preferences.dividendsLastUpdateTime &&
                new Date(user.preferences.dividendsLastUpdateTime).setHours(
                  0,
                  0,
                  0,
                  0
                ) !== new Date().setHours(0, 0, 0, 0) &&
                summary.quoteSummary.result.length &&
                summary.quoteSummary.result[0].calendarEvents &&
                new Date(
                  summary.quoteSummary.result[0].calendarEvents.dividendDate
                    .raw * 1000
                ).setHours(0, 0, 0, 0) == new Date().setHours(0, 0, 0, 0)
              ) {
                sendNotification(
                  JSON.parse(subscription.push_subscription),
                  `${q.symbol} | dividend payout today`,
                  "notification-icon-up.png"
                );
                user.preferences.dividendsLastUpdateTime = new Date().getTime();
                UserService.updateUser(user);
              }
            });
          } catch (err) {
            console.log(err);
          }
        }

        if (
          user.preferences &&
          user.preferences.notifications &&
          user.preferences.notifications.earnings
        ) {
          const symbols = portfolio.holdings.map((h) =>
            h.class === "stock"
              ? h.symbol
              : h.symbol.includes("-USD")
              ? h.symbol
              : `${h.symbol}-USD`
          );

          try {
            symbols.forEach(async (s) => {
              const summary = await StockService.getQuoteSummary(s);

              if (
                user.preferences.earningsLastUpdateTime &&
                new Date(user.preferences.earningsLastUpdateTime).setHours(
                  0,
                  0,
                  0,
                  0
                ) !== new Date().setHours(0, 0, 0, 0) &&
                summary.quoteSummary.result.length &&
                summary.quoteSummary.result[0].earnings &&
                new Date(
                  summary.quoteSummary.result[0].calendarEvents.earnings
                    .earningsDate.raw * 1000
                ).setHours(0, 0, 0, 0) == new Date().setHours(0, 0, 0, 0)
              ) {
                sendNotification(
                  JSON.parse(subscription.push_subscription),
                  `${q.symbol} | earnings update today`,
                  "notification-icon-up.png"
                );
                user.preferences.earningsLastUpdateTime = new Date().getTime();
                UserService.updateUser(user);
              }
            });
          } catch (err) {
            console.log(err);
          }
        }
      });
    }
  });
};

module.exports = notifications;
