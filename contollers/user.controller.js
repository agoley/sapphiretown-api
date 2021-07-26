const _user = require("../services/user.service");

const UserController = {
  auth: (server) => {
    server.post("/api/v1/users/auth", (req, res, next) => {
      _user.auth(req, res, next);
    });
  },
  create: (server) => {
    server.post("/api/v1/users", (req, res, next) => {
      _user.create(req, res, next);
    });
  },
  forgot: (server) => {
    server.post("/api/v1/forgot", (req, res, next) => {
      _user.forgot(req, res, next);
    });
  },
  reset: (server) => {
    server.post("/api/v1/reset", (req, res, next) => {
      _user.reset(req, res, next);
    });
  },
  update: (server) => {
    server.post("/api/v2/users", (req, res, next) => {
      _user.update(req, res, next);
    });
  },
  update_password: (server) => {
    server.post("/api/v2/users/:id/password", (req, res, next) => {
      _user.update_password(req, res, next);
    });
  },
};

module.exports = UserController;
