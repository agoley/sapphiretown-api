var resitifyCorsMiddleware = require('restify-cors-middleware');  
var restify = require('restify');
var controllers = require('./contollers/index.controller');

// CORS CONFIG
const cors = resitifyCorsMiddleware({  
    origins: ["*"],
    allowHeaders: ["Authorization"],
    exposeHeaders: ["Authorization"]
});

var server = restify.createServer();

// APPLY CORS 
server.pre(cors.preflight);  
server.use(cors.actual);  

// APPLY CONTROLLERS
controllers(server);

server.listen(8080, function() {
  console.log('%s listening at %s', server.name, server.url);
});