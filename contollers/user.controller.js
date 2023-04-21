const _user = require("../services/user.service");
var restify = require("restify");

let middleware = [
  restify.plugins.queryParser(),
  restify.plugins.bodyParser({
    mapParams: true,
  }),
];

const UserController = {
  get: (server) => {
    server.get("/api/v3/users/:id", ...middleware, (req, res, next) => {
      _user.get(req, res, next);
    });
  },
  auth: (server) => {
    server.post("/api/v1/users/auth", ...middleware, (req, res, next) => {
      _user.auth(req, res, next);
    });
  },
  create: (server) => {
    server.post("/api/v1/users", ...middleware, (req, res, next) => {
      _user.create(req, res, next);
    });
  },
  forgot: (server) => {
    server.post("/api/v1/forgot", ...middleware, (req, res, next) => {
      _user.forgot(req, res, next);
    });
  },
  reset: (server) => {
    server.post("/api/v1/reset", ...middleware, (req, res, next) => {
      _user.reset(req, res, next);
    });
  },
  update: (server) => {
    server.post("/api/v2/users", ...middleware, (req, res, next) => {
      _user.update(req, res, next);
    });
  },
  update_password: (server) => {
    server.post("/api/v2/users/:id/password", ...middleware, (req, res, next) => {
      _user.update_password(req, res, next);
    });
  },
  subscribe: (server) => {
    server.post("/api/v2/users/:id/subscribe", ...middleware, (req, res, next) => {
      _user.subscribe(req, res, next);
    });
  },
  unsubscribe: (server) => {
    server.post("/api/v2/users/:id/unsubscribe", ...middleware, (req, res, next) => {
      _user.unsubscribe(req, res, next);
    });
  },
};

module.exports = UserController;
