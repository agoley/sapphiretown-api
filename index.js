var restify = require("restify");
var controllers = require("./contollers/index.controller");
// var chronical = require("./jobs/chronical.job");
const WebSocket = require("ws");
const Reducer = require("./common/reducer");
var http = require("http");
var fs = require("fs");
var formidable = require("formidable");
const csv = require("fast-csv");

// TODO abstract mailer/transporter
var nodemailer = require("nodemailer");

let AWS = require("aws-sdk");

AWS.config.update({
  region: "us-east-1",
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

var ddb = new AWS.DynamoDB({ apiVersion: "2012-08-10" });
var docClient = new AWS.DynamoDB.DocumentClient();

const RESTIFY_ORIGIN = process.env.RESTIFY_ORIGIN || "*";
const PORT = process.env.PORT || 8080;

var server = restify.createServer();

var enterpriseServer = restify.createServer();

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

// CORS for enterprise servers
const enterpriseCors = corsMiddleware({
  preflightMaxAge: 600000,
  origins: ["*"],
});

// APPLY CORS
server.pre(cors.preflight);
server.use(cors.actual);
// server.use(restify.plugins.queryParser());
// server.use(
//   restify.plugins.bodyParser({
//     mapParams: true,
//   })
// );

const authenticateKey = (req, res, next) => {
  let api_key = req.header("x-api-key");

  // Find user
  var params = {
    TableName: "User",
    FilterExpression: "(api_key = :key )",
    ExpressionAttributeValues: {
      ":key": api_key,
    },
  };

  const onScan = (err, data) => {
    if (err) {
      console.error(
        "Unable to scan the table. Error JSON:",
        JSON.stringify(err, null, 2)
      );
      res.send({ error: { code: 403, message: "You not allowed." } });
    } else {
      if (data["Items"].length > 0) {
        return next();
      } else {
        res.send({ error: { code: 403, message: "You not allowed." } });
      }
    }
  };
  docClient.scan(params, onScan);
};

server.pre(enterpriseCors.preflight);
server.use(enterpriseCors.actual);
enterpriseServer.use((req, res, next) => {
  if (req.headers.host === "ezfolio-enterprise-server.herokuapp.com") {
    next();
  } else {
    // Apply API Key Authentication
    authenticateKey(req, res, next);
  }
});
// enterpriseServer.use(restify.plugins.queryParser());
// enterpriseServer.use(
//   restify.plugins.bodyParser({
//     mapParams: true,
//   })
// );

// const wss = new WebSocket.Server({ port: 8081 });
const wss = new WebSocket.Server(server);
const reducer = new Reducer();

var transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  auth: {
    user: "alex@ezfol.io",
    pass: process.env.MAIL_APP_PASS,
  },
});

/**
 * @swagger
 * /ws/v1/portfolio:
 *   get:
 *     summary: Portfolio insights
 *   parameters:
 *     - in: query
 *       name: id
 *       required: true
 *       description: ID of the Portfolio to get insights.
 *       type: string
 */
wss.on("connection", async (ws, req) => {
  if (req.url.startsWith("/ws/v1/portfolio")) {
    let url = new URL(`${req.headers.origin}${req.url}`);
    let portfolio = new Portfolio(url.searchParams.get("id"));
    await portfolio.hydrate();

    if (portfolio.transactions) {
      portfolio.subscribe(ws);
    }

    ws.on("close", () => {
      portfolio.unsubscribe();
    });
  } else {
    ws.on("message", (message) => {
      const data = JSON.parse(message);
      if (data.user) {
        // Check for subscription.
        reducer.handle(data, ws);

        var mailOptions = {
          from: "alex@ezfol.io",
          to: "alex@ezfol.io",
          subject: `${data.user.username} (${data.user.email}) spotted 👀`,
          html: `${data.user.username} (${data.user.email}) just visited`,
        };

        if (
          data &&
          data.user.username !== "alex" &&
          data.user.username !== "production" &&
          data.user.username !== "demo" &&
          data.user.username !== "test1"
        ) {
          transporter.sendMail(mailOptions, function (error, info) {
            if (error) {
              console.log(error);
            }
          });
        }
      }
    });
  }
});

// APPLY CONTROLLERS
controllers(server, false);
controllers(enterpriseServer, true);

var restifySwaggerJsdoc = require("restify-swagger-jsdoc");
const PortfolioService = require("./services/portfolio.service");
const Portfolio = require("./common/portfolio");
const notifications = require("./jobs/notifications.job");

restifySwaggerJsdoc.createSwaggerPage({
  title: "EZFol.io API documentation", // Page title
  version: "2.0.13", // Server version
  server: enterpriseServer, // Restify server instance created with restify.createServer()
  path: "/docs/swagger", // Public url where the swagger page will be available
  apis: ["./index.js", "./services/*.service.js"],
  host: process.env.SWAGGER_HOST || "ezfolio-enterprise-server.herokuapp.com/",
  schemes: ["https", "http"],
});

// setInterval(() => {
//   var params = {
//     TableName: "PushSubscription",
//     FilterExpression: "(user_id = :user_id)",
//     ExpressionAttributeValues: {
//       ":user_id": "d6380ef0-7ac8-11ee-814e-6124462c4cd7",
//     },
//   };

//   const onScan = (err, data) => {
//     if (err) {
//       console.error(
//         "Unable to scan the table. Error JSON:",
//         JSON.stringify(err, null, 2)
//       );
//       res.send({
//         color: "red",
//         message: "There was an error finding user.",
//       });
//     } else {
//       if (data["Items"].length > 0) {
//         var pn = data["Items"][0];
//         sendNotification(JSON.parse(pn.push_subscription));
//       }
//     }
//   };
//   docClient.scan(params, onScan);
// }, 10000);

if (process.env.RUN_SERVER === "enterprise") {
  enterpriseServer.listen(PORT, () => {
    console.log(
      "%s listening at %s",
      enterpriseServer.name,
      enterpriseServer.url
    );
  });
} else {
  server.listen(PORT, () => {
    console.log("%s listening at %s", server.name, server.url);
  });
}

// Every 24hrs records all users value and add to their history.
// setInterval(() => {
//   chronical();
// }, 86400000);

notifications();
