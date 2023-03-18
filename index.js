var restify = require("restify");
var controllers = require("./contollers/index.controller");
// var chronical = require("./jobs/chronical.job");
const WebSocket = require("ws");
const Reducer = require("./common/reducer");
var http = require("http");
var formidable = require("formidable");

// TODO abastract mailer/transporter
var nodemailer = require("nodemailer");

const RESTIFY_ORIGIN = process.env.RESTIFY_ORIGIN || "*";
const PORT = process.env.PORT || 8080;

var server = restify.createServer();

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

// APPLY CORS
server.pre(cors.preflight);
server.use(cors.actual);
server.use(restify.plugins.queryParser());

server.use(
  restify.plugins.bodyParser({
    mapParams: true,
  })
);
// const wss = new WebSocket.Server({ port: 8081 });
const wss = new WebSocket.Server(server);
const reducer = new Reducer();

var transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  auth: {
    user: "help@ezfol.io",
    pass: process.env.MAIL_PASS,
  },
});

wss.on("connection", (ws) => {
  ws.on("message", (message) => {
    const data = JSON.parse(message);
    if (data.user) {
      // Check for subscription.
      reducer.handle(data, ws);

      var mailOptions = {
        from: "hello@ezfol.io",
        to: "hello@ezfol.io",
        subject: `${data.user.username} (${data.user.email}) spotted 👀`,
        html: `${data.user.username} (${data.user.email}) just visited`,
      };

      if (
        data?.user.username !== "alex" &&
        data?.user.username !== "production" &&
        data?.user.username !== "demo" &&
        data?.user.username !== "test1"
      ) {
        transporter.sendMail(mailOptions, function (error, info) {
          if (error) {
            console.log(error);
          }
        });
      }
    }
  });
});

// APPLY CONTROLLERS
controllers(server);

var restifySwaggerJsdoc = require("restify-swagger-jsdoc");
restifySwaggerJsdoc.createSwaggerPage({
  title: "EZFol.io API documentation", // Page title
  version: "1.0.0", // Server version
  server: server, // Restify server instance created with restify.createServer()
  path: "/docs/swagger", // Public url where the swagger page will be available
  apis: ["./services/*.service.js"],
  host: "aqueous-beyond-14838.herokuapp.com/",
  schemes: ["https", "http"],
});

http
  .createServer((req, res) => {
    const originsWhiteList = [
      RESTIFY_ORIGIN,
      "https://www.ezfol.io",
      "https://ezfol.io",
      "http://www.ezfol.io",
      "http://ezfol.io",
    ];

    if (originsWhiteList.includes('*') || originsWhiteList.includes(req.headers.origin)) {
    res.setHeader("Access-Control-Allow-Origin", req.headers.origin);
    }
    res.setHeader("Access-Control-Allow-Methods", "OPTIONS, GET");
    res.setHeader("Access-Control-Max-Age", 2592000); // 30 days

    if (req.method === "OPTIONS") {
      res.writeHead(204, headers);
      res.end();
      return;
    }

    if (req.url == "/v3/transactions/upload") {
      var form = new formidable.IncomingForm();
      form.parse(req, function (err, fields, files) {
        console.log(fields);
        console.log(files);
        res.write("File uploaded");
        res.end();
      });
    }
  })
  .listen(8445);

server.listen(PORT, function () {
  console.log("%s listening at %s", server.name, server.url);
});

// Every 24hrs records all users value and add to their history.
// setInterval(() => {
//   chronical();
// }, 86400000);
