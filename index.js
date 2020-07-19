var resitifyCorsMiddleware = require("restify-cors-middleware");
var restify = require("restify");
var controllers = require("./contollers/index.controller");

const RESTIFY_ORIGIN = process.env.RESTIFY_ORIGIN || "*";
const PORT = process.env.PORT || 8080;

var server = restify.createServer();

// CORS CONFIG
const corsMiddleware = require("restify-cors-middleware");
const cors = corsMiddleware({
  origins: [RESTIFY_ORIGIN, "https://www.ezfol.io"]
});

// APPLY CORS
server.pre(cors.preflight);
server.use(cors.actual);
server.use(restify.plugins.queryParser());

server.use(
  restify.plugins.bodyParser({
    mapParams: true
  })
);

// server.pre((req, res, next) => {
//   res.header("Access-Control-Allow-Origin", "*");
//   next();
// });

// APPLY CONTROLLERS
controllers(server);

server.listen(PORT, function() {
  console.log("%s listening at %s", server.name, server.url);
});
