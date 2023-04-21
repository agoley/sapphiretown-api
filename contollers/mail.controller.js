const _mail = require("../services/mail.service");
var restify = require("restify");

let middleware = [
  restify.plugins.queryParser(),
  restify.plugins.bodyParser({
    mapParams: true,
  }),
];

const MailController = {
  mail: (server) => {
    server.post("/api/v1/mail", ...middleware, (req, res, next) => {
      _mail.mail(req, res, next);
    });
  },
};

module.exports = MailController;
