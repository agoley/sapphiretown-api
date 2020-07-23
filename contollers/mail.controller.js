const _mail = require("../services/mail.service");

const MailController = {
  mail: (server) => {
    server.post("/api/v1/mail", (req, res, next) => {
      _mail.mail(req, res, next);
    });
  },
};

module.exports = MailController;
