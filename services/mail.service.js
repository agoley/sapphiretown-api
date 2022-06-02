var nodemailer = require("nodemailer");

var transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  auth: {
    user: "help@ezfol.io",
    pass: process.env.MAIL_PASS,
  },
});

const MailService = {
  mail: (req, res, next, count) => {
    var mailOptions = {
      from: "hello@ezfol.io",
      to: process.env.MAIL_TO,
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
