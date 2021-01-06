var restify = require("restify");
var controllers = require("./contollers/index.controller");
var chronical = require("./jobs/chronical.job");

const RESTIFY_ORIGIN = process.env.RESTIFY_ORIGIN || "*";
const PORT = process.env.PORT || 8080;

var server = restify.createServer();

// CORS CONFIG
const corsMiddleware = require("restify-cors-middleware");
const cors = corsMiddleware({
  origins: [RESTIFY_ORIGIN, "https://www.ezfol.io", "https://ezfol.io"],
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

// APPLY CONTROLLERS
controllers(server);

server.listen(PORT, function () {
  console.log("%s listening at %s", server.name, server.url);
});

// Every 24hrs records all users value and add to their history.
setTimeout(() => {
  chronical();
}, 86400000);
