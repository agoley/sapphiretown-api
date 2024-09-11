var nodemailer = require("nodemailer");

var transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  auth: {
    user: "alex@ezfol.io",
    pass: process.env.MAIL_APP_PASS,
  },
});

const MailService = {
  mail: (req, res, next, count) => {
    var mailOptions = {
      from: "alex@ezfol.io",
      to: process.env.MAIL_APP_TO,
      subject: req.body.subject,
      text: req.body.text,
    };

    transporter.sendMail(mailOptions, function (error, info) {
      if (error) {
        console.log(error);
        return next();
      } else {
        res.send({});
        return next();
      }
    });
  },
};

module.exports = MailService;
