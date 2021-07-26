let AWS = require("aws-sdk");
const { v1: uuidv1 } = require("uuid");
const bcrypt = require("bcrypt");

// TODO abastract mailer/transporter
var nodemailer = require("nodemailer");

var transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: "ezfolio.contact@gmail.com",
    pass: process.env.MAIL_PASS,
  },
});

AWS.config.update({
  region: "us-east-1",
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

var ddb = new AWS.DynamoDB({ apiVersion: "2012-08-10" });
var docClient = new AWS.DynamoDB.DocumentClient();

// TODO: abstract a lot of the db accesses to observables.

const UserService = {
  reset: (req, res, next) => {
    var params = {
      TableName: "Reset",
      FilterExpression: "(#token = :token)",
      ExpressionAttributeNames: { "#token": "token" },
      ExpressionAttributeValues: {
        ":token": req.body.token,
      },
    };

    const onScan = (err, data) => {
      if (err) {
        console.error(
          "Unable to scan the table. Error JSON:",
          JSON.stringify(err, null, 2)
        );
      } else {
        if (data["Items"].length > 0) {
          var reset = data["Items"][0];

          var userLookupParams = {
            TableName: "User",
            FilterExpression: "(id = :user_id)",
            ExpressionAttributeValues: {
              ":user_id": reset.user_id,
            },
          };

          const onUserLookupScan = (err, data) => {
            if (err) {
              console.error(
                "Unable to scan the table. Error JSON:",
                JSON.stringify(err, null, 2)
              );
              res.send({
                color: "red",
                message: "There was en error resetting your password.",
              });
            } else {
              if (data["Items"].length > 0) {
                var user = data["Items"][0];

                var params = {
                  TableName: "User",
                  Key: {
                    id: user.user_id,
                  },
                  UpdateExpression: "set password = :password",
                  ExpressionAttributeValues: {
                    ":password": bcrypt.hashSync(req.body.password, 10),
                  },
                  ReturnValues: "UPDATED_NEW",
                };

                docClient.update(params, function (err, data) {
                  if (err) {
                    console.error(
                      "Unable to update item. Error JSON:",
                      JSON.stringify(err, null, 2)
                    );
                    res.send({
                      color: "red",
                      message: "There was an error updating your password.",
                    });
                  } else {
                    console.log(
                      "UpdateItem succeeded:",
                      JSON.stringify(data, null, 2)
                    );
                    delete user.password;
                    res.send(user);
                    return next();
                  }
                });
              } else {
                res.send({
                  color: "red",
                  message: "Unable to find account.",
                });
              }
              return next();
            }
          };
          docClient.scan(params, onUserLookupScan);
        } else {
          res.send({
            color: "red",
            message:
              "Invalid token: Token may have expired. Try requesting a reset again.",
          });
        }
        return next();
      }
    };
    docClient.scan(params, onScan);
  },
  forgot: (req, res, next) => {
    var params = {
      TableName: "User",
      FilterExpression: "(username = :username or email = :username)",
      ExpressionAttributeValues: {
        ":username": req.body.identifier,
      },
    };

    const onScan = (err, data) => {
      if (err) {
        console.error(
          "Unable to scan the table. Error JSON:",
          JSON.stringify(err, null, 2)
        );
        res.send({
          color: "red",
          message: "There was an error resetting the password.",
        });
      } else {
        if (data["Items"].length > 0) {
          var user = data["Items"][0];

          const reset = {
            token: uuidv1(),
            user_id: user.id,
            expdate: Math.floor(new Date().getTime() / 1000) + 86400,
          };

          var createParams = {
            TableName: "Reset",
            Item: {
              token: { S: reset.token },
              user_id: { S: reset.user_id },
              expdate: { N: reset.expdate.toString() },
            },
          };

          // Call DynamoDB to add the item to the table
          ddb.putItem(createParams, (err, data) => {
            if (err) {
              console.log("Error", err);
              res.send({});
              return next();
            } else {
              var mailOptions = {
                from: "ezfolio.contact@gmail.com",
                to: user.email,
                subject: "Reset your password",
                html:
                  "<p>We recieved a request to reset your password. Use the link below to complete the process." +
                  " This link will expire in 24 hours.</p>" +
                  "<a href='https://www.ezfol.io/reset?token=" +
                  reset.token +
                  "'>Reset Password for " +
                  user.username +
                  "</a>" +
                  "<p>Thank you for being a valued user of EZFol.io.</p>" +
                  "<p>Sincerely,</p>" +
                  "<p> - EZFol.io Customer Service Team",
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

              res.send({});
              return next();
            }
          });
        } else {
          res.send({
            color: "red",
            message: "Unable to find account with username or email.",
          });
        }
        return next();
      }
    };
    docClient.scan(params, onScan);
  },
  auth: (req, res, next) => {
    var params = {
      TableName: "User",
      FilterExpression: "(username = :username or email = :username)",
      ExpressionAttributeValues: {
        ":username": req.body.identifier,
      },
    };

    const onScan = (err, data) => {
      if (err) {
        console.error(
          "Unable to scan the table. Error JSON:",
          JSON.stringify(err, null, 2)
        );
        res.send({
          color: "red",
          message: "There was an error signing in.",
        });
      } else {
        if (data["Items"].length > 0) {
          var user = data["Items"][0];

          bcrypt.compare(
            req.body.password,
            user.password,
            function (err, doesMatch) {
              if (doesMatch) {
                //log him in
                delete user.password;
                res.send(user);
              } else {
                //go away
                res.send({
                  color: "red",
                  message: "Incorrect Password.",
                });
              }
            }
          );
        } else {
          res.send({
            color: "red",
            message: "Unable to find account with username or email.",
          });
        }
        return next();
      }
    };
    docClient.scan(params, onScan);
  },
  create: (req, res, next) => {
    // Check for username or email conflicts.
    var params = {
      TableName: "User",
      FilterExpression: "(username = :username or email = :email)",
      ExpressionAttributeValues: {
        ":username": req.body.username,
        ":email": req.body.email,
      },
    };

    const onScan = (err, data) => {
      if (err) {
        console.error(
          "Unable to scan the table. Error JSON:",
          JSON.stringify(err, null, 2)
        );
      } else {
        if (data["Items"].length > 0) {
          // There is a conflict.
          var user = data["Items"][0];

          if (req.body.username === user.username) {
            // A user already exists with the username.
            res.send({
              message: "There is already an account with that username.",
            });
          } else {
            // A user already exists with the email.
            res.send({
              message: "There is already an account with that email.",
            });
          }
        } else {
          // There is no conflict.
          const usr = {
            id: uuidv1(),
            username: req.body.username,
            email: req.body.email,
            password: bcrypt.hashSync(req.body.password, 10),
            created: new Date().toString(),
          };

          var createParams = {
            TableName: "User",
            Item: {
              id: { S: usr.id },
              username: { S: usr.username },
              email: { S: usr.email },
              password: { S: usr.password },
              created: { S: usr.created },
            },
          };

          // Call DynamoDB to add the item to the table
          ddb.putItem(createParams, (err, data) => {
            if (err) {
              console.log("Error", err);
            } else {
              delete usr.password;
              res.send(usr);
              return next();
            }
          });
        }
        return next();
      }
    };
    docClient.scan(params, onScan);
  },
  update: (req, res, next) => {
    // Check for username or email conflicts.
    var params = {
      TableName: "User",
      FilterExpression:
        "(not id = :id and (username = :username or email = :email))",
      ExpressionAttributeValues: {
        ":username": req.body.username,
        ":email": req.body.email,
        ":id": req.body.id,
      },
    };

    const onScan = (err, data) => {
      if (err) {
        console.error(
          "Unable to scan the table. Error JSON:",
          JSON.stringify(err, null, 2)
        );
      } else {
        if (data["Items"].length > 0) {
          // There is a conflict.
          var user = data["Items"][0];

          if (req.body.username === user.username) {
            // A user already exists with the username.
            res.send({
              message: "There is already an account with that username.",
            });
          } else {
            // A user already exists with the email.
            res.send({
              message: "There is already an account with that email.",
            });
          }
        } else {
          // There is no conflict.

          var params = {
            TableName: "User",
            Key: {
              id: req.body.id,
            },
            UpdateExpression:
              "set username = :username, email=:email, theme=:theme",
            ExpressionAttributeValues: {
              ":username": req.body.username,
              ":email": req.body.email,
              ":theme": req.body.theme || "light-theme",
            },
            ReturnValues: "UPDATED_NEW",
          };

          console.log("Updating the item...");
          docClient.update(params, function (err, data) {
            if (err) {
              console.error(
                "Unable to update item. Error JSON:",
                JSON.stringify(err, null, 2)
              );
              res.send(err);
            } else {
              console.log(
                "UpdateItem succeeded:",
                JSON.stringify(data, null, 2)
              );
              res.send(data);
            }
          });
        }
        return next();
      }
    };
    docClient.scan(params, onScan);
  },
  update_password: (req, res, next) => {
    var params = {
      TableName: "User",
      FilterExpression: "(username = :username or email = :username)",
      ExpressionAttributeValues: {
        ":username": req.body.identifier,
      },
    };

    const onScan = (err, data) => {
      if (err) {
        console.error(
          "Unable to scan the table. Error JSON:",
          JSON.stringify(err, null, 2)
        );
        res.send({
          color: "red",
          message: "There was an error signing in.",
        });
      } else {
        if (data["Items"].length > 0) {
          var user = data["Items"][0];

          bcrypt.compare(
            req.body.password,
            user.password,
             (err, doesMatch) => {
              if (doesMatch) {

                var params = {
                  TableName: "User",
                  Key: {
                    id: req.params.id,
                  },
                  UpdateExpression: "set password = :password",
                  ExpressionAttributeValues: {
                    ":password": bcrypt.hashSync(req.body.newPassword, 10),
                  },
                  ReturnValues: "UPDATED_NEW",
                };

                console.log("Updating the item...");
                docClient.update(params, function (err, data) {
                  if (err) {
                    console.error(
                      "Unable to update item. Error JSON:",
                      JSON.stringify(err, null, 2)
                    );
                    res.send(err);
                  } else {
                    console.log(
                      "UpdateItem succeeded:",
                      JSON.stringify(data, null, 2)
                    );
                    res.send(data);
                  }
                });
              } else {
                //go away
                res.send({
                  color: "red",
                  message: "Incorrect Password.",
                });
              }
            }
          );
        } else {
          res.send({
            color: "red",
            message: "Unable to find account with username or email.",
          });
        }
        return next();
      }
    };
    docClient.scan(params, onScan);
  },
};

module.exports = UserService;
