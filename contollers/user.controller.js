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
};

module.exports = UserController;
