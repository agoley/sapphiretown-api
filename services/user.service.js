let AWS = require("aws-sdk");
const { v1: uuidv1 } = require("uuid");
const bcrypt = require("bcrypt");
const puppeteer = require("puppeteer");

// TODO abstract mailer/transporter
var nodemailer = require("nodemailer");

// Stripe client
const stripe = require("stripe")(process.env.STRIPE_SECRET);

var transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  auth: {
    user: "alex@ezfol.io",
    pass: process.env.MAIL_APP_PASS,
  },
});

AWS.config.update({
  region: "us-east-1",
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

// Configure AWS Objects
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || "us-east-1",
});

const ddb = new AWS.DynamoDB({ apiVersion: "2012-08-10" });
const docClient = new AWS.DynamoDB.DocumentClient();

export const PLAN_NAMES = Object.freeze({
  FREE: "FREE",
  PRO: "PRO",
  PLANNER: "PLANNER",
  ENTERPRISE: "ENTERPRISE",
});

export const DEFAULT_USER_PREFERENCES = {
  username: "",
  defaults: {
    timerange: "1d",
    layout: "table",
  },
  dashboard: {
    overview: true,
    holdings: true,
    market: true,
    watchlist: true,
    distribution: true,
    trending: true,
  },
  notifications: {
    dividends: true,
    earnings: true,
    largeChange: true,
  },
};

const genAPIKey = () => {
  //create a base-36 string that contains 30 chars in a-z,0-9
  return [...Array(30)]
    .map((e) => ((Math.random() * 36) | 0).toString(36))
    .join("");
};

const generateRandomPassword = (length = 12) => {
  const charset =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
  let password = "";
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return password;
};

const getUserById = (id) => {
  var params = {
    TableName: "User",
    FilterExpression: "(id = :id)",
    ExpressionAttributeValues: {
      ":id": id,
    },
  };

  return new Promise((resolve, reject) => {
    const onScan = (err, data) => {
      if (err) {
        console.error(
          "Unable to scan the table. Error JSON:",
          JSON.stringify(err, null, 2)
        );
        reject({
          color: "red",
          message: "There was an error finding user.",
        });
      } else {
        if (data["Items"].length > 0) {
          var user = data["Items"][0];

          delete user.password;
          delete user.stripe_customer_id;
          delete user.stripe_payment_method_id;
          delete user.stripe_subscription_id;

          try {
            user.watchlist = JSON.parse(user.watchlist);
          } catch (err) {
            user.watchlist = null;
          }

          try {
            user.preferences = JSON.parse(user.preferences);
          } catch (err) {
            user.preferences = null;
          }

          resolve(user);
        } else {
          reject({
            color: "red",
            message: "Unable to find user.",
          });
        }
      }
    };
    docClient.scan(params, onScan);
  });
};

const updateUser = (user) => {
  // Check for username or email conflicts.
  return new Promise((resolve, reject) => {
    var params = {
      TableName: "User",
      FilterExpression: "(not id = :id and (email = :email))",
      ExpressionAttributeValues: {
        ":email": user.email,
        ":id": user.id,
      },
    };

    const onScan = (err, data) => {
      if (err) {
        console.error(
          "Unable to scan the table. Error JSON:",
          JSON.stringify(err, null, 2)
        );
        reject(err);
      } else {
        if (data["Items"].length > 0) {
          // A user already exists with the email.
          reject({
            error: "email must be unique",
            message: "There is already an account with that email.",
          });
        } else {
          // There is no conflict.

          var params = {
            TableName: "User",
            Key: {
              id: user.id,
            },
            UpdateExpression:
              "set email=:email, theme=:theme, active_portfolio=:active_portfolio, preferences=:preferences",
            ExpressionAttributeValues: {
              ":email": user.email,
              ":theme": user.theme || "light-theme",
              ":active_portfolio": user.active_portfolio || "",
              ":preferences": JSON.stringify(user.preferences),
            },
            ReturnValues: "ALL_NEW",
          };

          docClient.update(params, (err, data) => {
            if (err) {
              console.error(
                "Unable to update item. Error JSON:",
                JSON.stringify(err, null, 2)
              );
              reject({ error: err });
            } else {
              if (data["Attributes"].password) {
                delete data["Attributes"].password;
              }
              resolve(data);
            }
          });
        }
      }
    };
    docClient.scan(params, onScan);
  });
};

const getPushSubscriptionByUserId = (user_id) => {
  var params = {
    TableName: "PushSubscription",
    FilterExpression: "(user_id = :user_id)",
    ExpressionAttributeValues: {
      ":user_id": user_id,
    },
  };

  return new Promise((resolve, reject) => {
    const onScan = (err, data) => {
      if (err) {
        console.error(
          "Unable to scan the table. Error JSON:",
          JSON.stringify(err, null, 2)
        );
        reject({
          color: "red",
          message: "There was an error finding subscription.",
        });
      } else {
        if (data["Items"].length > 0) {
          resolve(data["Items"][0]);
        } else {
          reject({
            color: "red",
            message: "Unable to find subscription.",
          });
        }
      }
    };
    docClient.scan(params, onScan);
  });
};

const getPaymentMethodsByUserId = (user_id) => {
  var params = {
    TableName: "User",
    FilterExpression: "(id = :user_id)",
    ExpressionAttributeValues: {
      ":user_id": user_id,
    },
  };

  return new Promise(async (resolve, reject) => {
    const onScan = async (err, data) => {
      if (err) {
        console.error(
          "Unable to scan the table. Error JSON:",
          JSON.stringify(err, null, 2)
        );
        reject({
          color: "red",
          message: "There was an error finding user.",
        });
      } else {
        if (data["Items"].length > 0) {
          if (data["Items"][0].stripe_customer_id) {
            let methods = await stripe.paymentMethods.list({
              customer: data["Items"][0].stripe_customer_id,
            });
            resolve(methods);
          } else {
            resolve(null);
          }
        } else {
          reject({
            color: "red",
            message: "Unable to find user.",
          });
        }
      }
    };
    docClient.scan(params, onScan);
  });
};

const getChargesByUserId = (user_id) => {
  var params = {
    TableName: "User",
    FilterExpression: "(id = :user_id)",
    ExpressionAttributeValues: {
      ":user_id": user_id,
    },
  };

  return new Promise(async (resolve, reject) => {
    const onScan = async (err, data) => {
      if (err) {
        console.error(
          "Unable to scan the table. Error JSON:",
          JSON.stringify(err, null, 2)
        );
        reject({
          color: "red",
          message: "There was an error finding user.",
        });
      } else {
        if (data["Items"].length > 0) {
          if (data["Items"][0].stripe_customer_id) {
            let methods = await stripe.charges.list({
              customer: data["Items"][0].stripe_customer_id,
            });
            resolve(methods);
          } else {
            resolve(null);
          }
        } else {
          reject({
            color: "red",
            message: "Unable to find user.",
          });
        }
      }
    };
    docClient.scan(params, onScan);
  });
};

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
                color: "#f51068",
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
                      color: "#f51068",
                      message: "There was an error updating your password.",
                    });
                  } else {
                    console.log(
                      "UpdateItem succeeded:",
                      JSON.stringify(data, null, 2)
                    );
                    delete user.password;
                    res.send(user);
                  }
                });
              } else {
                res.send({
                  color: "#f51068",
                  message: "Unable to find account.",
                });
              }
            }
          };
          docClient.scan(params, onUserLookupScan);
        } else {
          res.send({
            color: "#f51068",
            message:
              "Invalid token: Token may have expired. Try requesting a reset again.",
          });
        }
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
            expdate: Math.floor(new Date().getTime()) + 86400,
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
            } else {
              var mailOptions = {
                from: "alex@ezfol.io",
                to: user.email,
                subject: "Reset your password",
                html:
                  "<p>We received a request to reset your password. Use the link below to complete the process." +
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
                }
              });

              res.send({});
            }
          });
        } else {
          res.send({
            color: "red",
            message: "Unable to find account with username or email.",
          });
        }
      }
    };
    docClient.scan(params, onScan);
  },

  magicLink: (req, res, next) => {
    var params = {
      TableName: "User",
      FilterExpression: "(email = :email)",
      ExpressionAttributeValues: {
        ":email": req.body.email,
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
          message: "There was an error getting a magic link.",
        });
      } else {
        if (data["Items"].length > 0) {
          var user = data["Items"][0];

          const magicLink = {
            token: uuidv1(),
            user_id: user.id,
            expdate: Math.floor(new Date().getTime()) + 86400,
          };

          var createParams = {
            TableName: "MagicLink",
            Item: {
              token: { S: magicLink.token },
              user_id: { S: magicLink.user_id },
              expdate: { N: magicLink.expdate.toString() },
            },
          };

          // Call DynamoDB to add the item to the table
          ddb.putItem(createParams, (err, data) => {
            if (err) {
              console.log("Error", err);
              res.send({});
            } else {
              if (req.body.passwordReset) {
                var mailOptions = {
                  from: "ezfolio.contact@gmail.com",
                  to: user.email,
                  subject: "Your EZFol.io Magic Link",
                  html:
                    "<p>We received a request for a magic link. Use the link below to reset your password." +
                    " This link will expire in 24 hours. Make sure to open it in the same browser you're logged in with.</p>" +
                    "<a href='https://www.ezfol.io/profile/security?magicLink=" +
                    magicLink.token +
                    "'>Magic Link for " +
                    user.email +
                    "</a>" +
                    "<p>Thank you for being a valued user of EZFol.io.</p>" +
                    "<p>Sincerely,</p>" +
                    "<p> - Alex (Founder)",
                };
              } else {
                var mailOptions = {
                  from: "ezfolio.contact@gmail.com",
                  to: user.email,
                  subject: "Your EZFol.io Magic Link",
                  html:
                    "<p>We received a request for a magic link. Use the link below to skip the login." +
                    " This link will expire in 24 hours.</p>" +
                    "<a href='https://www.ezfol.io/?magicLink=" +
                    magicLink.token +
                    "'>Magic Link for " +
                    user.email +
                    "</a>" +
                    "<p>Thank you for being a valued user of EZFol.io.</p>" +
                    "<p>Sincerely,</p>" +
                    "<p> - Alex (Founder)",
                };
              }

              transporter.sendMail(mailOptions, function (error, info) {
                if (error) {
                  console.log(error);
                  return next();
                } else {
                  res.send({});
                }
              });

              res.send({});
            }
          });
        } else {
          res.send({
            color: "red",
            message: "Unable to find account with email.",
          });
        }
      }
    };
    docClient.scan(params, onScan);
  },

  /**
   * @swagger
   * /api/v4/users/{identifier}:
   *  get:
   *    summary: Retrieves a user by identifier, which can be an id, username, or email.
   *    consumes:
   *      - application/json
   *    parameters:
   *     - in: path
   *       name: identifier
   *       description: ID, username, or email of the user you want to find.
   *       required: true
   *       schema:
   *         type: string
   *         example: "2e650950-75a1-11eb-bd85-09531521011f"
   *    responses:
   *      '200':
   *        description: The retrieved user.
   *        content:
   *          application/json:
   *            schema:
   *              $ref: '#/definitions/User'
   *
   */
  find: (req, res, next) => {
    var params = {
      TableName: "User",
      FilterExpression:
        "(username = :identifier or email = :identifier or id = :identifier)",
      ExpressionAttributeValues: {
        ":identifier": req.params.identifier,
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
          message: "There was an error finding user.",
        });
      } else {
        if (data["Items"].length > 0) {
          var user = data["Items"][0];

          delete user.password;
          delete user.stripe_customer_id;
          delete user.stripe_payment_method_id;
          delete user.stripe_subscription_id;

          res.json(user);
        } else {
          res.send({
            color: "red",
            message: "Unable to find user.",
          });
        }
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

          bcrypt.compare(req.body.password, user.password, (err, doesMatch) => {
            if (doesMatch) {
              //log him in
              delete user.password;
              res.json(user);
            } else {
              //go away
              res.send({
                color: "red",
                message: "Incorrect Password.",
              });
            }
          });
        } else {
          res.send({
            color: "red",
            message: "Unable to find account with username or email.",
          });
        }
      }
    };
    docClient.scan(params, onScan);
  },
  authenticate: (req, res, next) => {
    if (req.body.email) {
      var params = {
        TableName: "User",
        FilterExpression: "(email = :email)",
        ExpressionAttributeValues: {
          ":email": req.body.email,
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

            // A user was found with the provided email

            bcrypt.compare(
              req.body.password,
              user.password,
              (err, doesMatch) => {
                if (doesMatch) {
                  if (req.body.invitation) {
                    // Create the client account and log in

                    // Lookup the invitation

                    var params = {
                      TableName: "Invitation",
                      FilterExpression: "(id = :id)",
                      ExpressionAttributeValues: {
                        ":id": req.body.invitation,
                      },
                    };

                    const onInvitationScan = (err, data) => {
                      if (err) {
                        console.error(
                          "Unable to scan the table. Error JSON:",
                          JSON.stringify(err, null, 2)
                        );
                      } else {
                        if (data["Items"].length > 0) {
                          const invitation = data["Items"][0];

                          // This user was invited, set their plan to Pro

                          var params = {
                            TableName: "User",
                            Key: {
                              id: user.id,
                            },
                            UpdateExpression: "set plan_name=:plan_name",
                            ExpressionAttributeValues: {
                              ":plan_name": "PRO",
                            },
                            ReturnValues: "ALL_NEW",
                          };

                          docClient.update(params, (err, data) => {
                            if (err) {
                              console.error(
                                "Unable to update item. Error JSON:",
                                JSON.stringify(err, null, 2)
                              );
                              reject({ error: err });
                            } else {
                              // User was updated, now create the client account

                              var params = {
                                TableName: "User",
                                FilterExpression: "(id = :id)",
                                ExpressionAttributeValues: {
                                  ":id": invitation.advisor_id,
                                },
                              };

                              const onUserScan = (err, data) => {
                                if (err) {
                                  console.error(
                                    "Unable to scan the table. Error JSON:",
                                    JSON.stringify(err, null, 2)
                                  );
                                } else {
                                  if (data["Items"].length > 0) {
                                    var advisor = data["Items"][0];

                                    var createParams = {
                                      TableName: "Client",
                                      Item: {
                                        id: { S: uuidv1() },
                                        user_id: { S: advisor.id },
                                        client_id: { S: user.id },
                                      },
                                    };

                                    // Add the client record
                                    ddb.putItem(createParams, (err, data) => {
                                      if (err) {
                                        console.log(
                                          "putItem failed:",
                                          JSON.stringify(err, null, 2)
                                        );
                                      } else {
                                        // Delete the invitation so it can't be used again

                                        var params = {
                                          Key: {
                                            id: {
                                              S: invitation.id,
                                            },
                                          },
                                          TableName: "Invitation",
                                        };

                                        ddb.deleteItem(params, (err, data) => {
                                          if (err) {
                                            console.log("Error", err);
                                          } else {
                                            // log them in
                                            delete user.password;
                                            res.json(user);
                                          }
                                        });
                                      }
                                    });
                                  }
                                }
                              };

                              docClient.scan(params, onUserScan);
                            }
                          });
                        } else {
                          // log them in
                          delete user.password;
                          res.json(user);
                        }
                      }
                    };

                    docClient.scan(params, onInvitationScan);
                  } else {
                    // log them in
                    delete user.password;
                    res.json(user);
                  }
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
        }
      };
      docClient.scan(params, onScan);
    } else if (req.body.magicLink) {
      params = {
        TableName: "MagicLink",
        FilterExpression: "(#token = :token)",
        ExpressionAttributeNames: { "#token": "token" },
        ExpressionAttributeValues: {
          ":token": req.body.magicLink,
        },
      };

      const onScan = (err, data) => {
        if (err) {
          console.error(
            "Unable to scan the table. Error JSON:",
            JSON.stringify(err, null, 2)
          );
        } else {
          if (
            data["Items"].length > 0 &&
            data["Items"][0].expdate > new Date().getTime()
          ) {
            const magicLink = data["Items"][0];

            var userLookupParams = {
              TableName: "User",
              FilterExpression: "(id = :user_id)",
              ExpressionAttributeValues: {
                ":user_id": magicLink.user_id,
              },
            };

            const onUserLookupScan = (err, data) => {
              if (err) {
                console.error(
                  "Unable to scan the table. Error JSON:",
                  JSON.stringify(err, null, 2)
                );
                res.send({
                  color: "#f51068",
                  message: "There was en error signing.",
                });
              } else {
                if (data["Items"].length > 0) {
                  var user = data["Items"][0];
                  delete user.password;
                  res.send(user);
                } else {
                  res.send({
                    color: "#f51068",
                    message: "Unable to find account.",
                  });
                }
              }
            };
            docClient.scan(userLookupParams, onUserLookupScan);
          } else {
            res.send({
              color: "#f51068",
              message:
                "Invalid token: Token may have expired. Try requesting a link again.",
            });
          }
        }
      };
      docClient.scan(params, onScan);
    } else {
      res.send({
        color: "#f51068",
        message: "Failed to authenticate.",
      });
    }
  },
  /**
   * @swagger
   * /api/v1/users:
   *   post:
   *     summary: Create a User.
   *     parameters:
   *       - in: body
   *         name: User
   *         schema:
   *           type: object
   *           required:
   *             - username
   *             - email
   *             - password
   *           properties:
   *             username:
   *               type: string
   *             email:
   *               type: string
   *             password:
   *               type: string
   *             invitation:
   *               type: string
   *     responses:
   *       '200':
   *         description: The newly created user.
   *         content:
   *           application/json:
   *             type: object
   */
  create: (req, res, next) => {
    // Check for username or email conflicts.
    var params = {
      TableName: "User",
      FilterExpression: "(email = :email)",
      ExpressionAttributeValues: {
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

          // A user already exists with the email.
          res.send({
            message: "There is already an account with that email.",
          });
        } else {
          // There is no conflict.
          const usr = {
            id: uuidv1(),
            email: req.body.email,
            password: bcrypt.hashSync(req.body.password, 10),
            created: new Date().toString(),
          };

          if (req.body.invitation) {
            // Lookup the invitation

            var params = {
              TableName: "Invitation",
              FilterExpression: "(id = :id)",
              ExpressionAttributeValues: {
                ":id": req.body.invitation,
              },
            };

            const onInvitationScan = (err, data) => {
              if (err) {
                console.error(
                  "Unable to scan the table. Error JSON:",
                  JSON.stringify(err, null, 2)
                );
              } else {
                if (data["Items"].length > 0) {
                  const invitation = data["Items"][0];

                  // This user was invited, set their plan to Pro
                  usr.plan_name = "PRO";

                  // First lookup the advisor

                  var params = {
                    TableName: "User",
                    FilterExpression: "(id = :id)",
                    ExpressionAttributeValues: {
                      ":id": invitation.advisor_id,
                    },
                  };

                  const onUserScan = (err, data) => {
                    if (err) {
                      console.error(
                        "Unable to scan the table. Error JSON:",
                        JSON.stringify(err, null, 2)
                      );
                    } else {
                      if (data["Items"].length > 0) {
                        var advisor = data["Items"][0];

                        var createParams = {
                          TableName: "Client",
                          Item: {
                            id: { S: uuidv1() },
                            user_id: { S: advisor.id },
                            client_id: { S: usr.id },
                          },
                        };

                        // Add the client record
                        ddb.putItem(createParams, (err, data) => {
                          console.log(
                            "putItem succeeded:",
                            JSON.stringify(data, null, 2)
                          );
                        });
                      }
                    }
                  };

                  docClient.scan(params, onUserScan);
                }
              }
            };

            docClient.scan(params, onInvitationScan);
          }

          var mailOptions = {
            from: "ezfolio.contact@gmail.com",
            to: "alex@ezfol.io",
            subject: "New User",
            html: `<div>
                     <h2>New user</h2>
                     <p>${usr.id}</p>
                     <p>${usr.email}</p>
                     <p>${usr.created}</p>
                  </div>`,
          };

          transporter.sendMail(mailOptions, function (error, info) {
            if (error) {
              console.log(error);
              return next();
            } else {
              res.send({});
            }
          });

          var createParams = {
            TableName: "User",
            Item: {
              id: { S: usr.id },
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
            }
          });
        }
      }
    };
    docClient.scan(params, onScan);
  },
  createV3: (req, res, next) => {
    // Check for username or email conflicts.
    var params = {
      TableName: "User",
      FilterExpression: "(email = :email)",
      ExpressionAttributeValues: {
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

          // A user already exists with the email.
          res.send({
            message: "There is already an account with that email.",
          });
        } else {
          // There is no conflict.

          var mailOptions = {
            from: "ezfolio.contact@gmail.com",
            to: "alex@ezfol.io",
            subject: "New User",
            html: `<div>
                     <h2>New user</h2>
                     <p>${usr.id}</p>
                     <p>${usr.email}</p>
                     <p>${usr.created}</p>
                  </div>`,
          };

          transporter.sendMail(mailOptions, function (error, info) {
            if (error) {
              console.log(error);
              return next();
            } else {
              res.send({});
            }
          });

          if (req.body.password) {
            const usr = {
              id: uuidv1(),
              email: req.body.email,
              password: bcrypt.hashSync(req.body.password, 10),
              created: new Date().toString(),
            };

            var createParams = {
              TableName: "User",
              Item: {
                id: { S: usr.id },
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
              }
            });
          } else if (req.body.sso_ip) {
            // Check for username or email conflicts.
            var params = {
              TableName: "User",
              FilterExpression: "(email = :email)",
              ExpressionAttributeValues: {
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

                  // A user already exists with the email.
                  res.send({
                    message: "There is already an account with that email.",
                  });
                } else {
                  // There is no conflict.
                  const usr = {
                    id: uuidv1(),
                    email: req.body.email,
                    sso_ip: req.body.sso_ip,
                    created: new Date().toString(),
                  };

                  var createParams = {
                    TableName: "User",
                    Item: {
                      id: { S: usr.id },
                      email: { S: usr.email },
                      sso_ip: { S: usr.sso_ip },
                      created: { S: usr.created },
                    },
                  };

                  // Call DynamoDB to add the item to the table
                  ddb.putItem(createParams, (err, data) => {
                    if (err) {
                      console.log("Error", err);
                    } else {
                      if (usr.password) {
                        delete usr.password;
                      }
                      res.send(usr);
                    }
                  });
                }
              }
            };
            docClient.scan(params, onScan);
          }
        }
      }
    };
    docClient.scan(params, onScan);
  },
  update: (req, res, next) => {
    // Check for username or email conflicts.
    var params = {
      TableName: "User",
      FilterExpression: "(not id = :id and (email = :email))",
      ExpressionAttributeValues: {
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

          // A user already exists with the email.
          res.send({
            message: "There is already an account with that email.",
          });
        } else {
          var user = data["Items"][0];
          // There is no conflict.

          var params = {
            TableName: "User",
            Key: {
              id: req.body.id,
            },
            UpdateExpression:
              "set email=:email, theme=:theme, active_portfolio=:active_portfolio, preferences=:preferences, plan_name=:plan_name",
            ExpressionAttributeValues: {
              ":email": req.body.email,
              ":theme": req.body.theme || "light-theme",
              ":active_portfolio":
                req.body.active_portfolio || user
                  ? user.active_portfolio
                  : false || "",
              ":preferences": JSON.stringify(req.body.preferences),
              ":plan_name": req.body.plan_name || "FREE",
            },
            ReturnValues: "ALL_NEW",
          };

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
              if (data["Attributes"].password) {
                delete data["Attributes"].password;
              }
              res.send(data);
            }
          });
        }
      }
    };
    docClient.scan(params, onScan);
  },
  update_watchlist: (req, res, next) => {
    // Check for username or email conflicts.
    var params = {
      TableName: "User",
      FilterExpression: "(id = :id)",
      ExpressionAttributeValues: {
        ":id": req.params.id,
      },
    };

    const onScan = (err, data) => {
      if (err) {
        console.error(
          "Unable to scan the table. Error JSON:",
          JSON.stringify(err, null, 2)
        );
      } else {
        var user = data["Items"][0];
        // There is no conflict.

        var params = {
          TableName: "User",
          Key: {
            id: req.params.id,
          },
          UpdateExpression: "set watchlist = :watchlist",
          ExpressionAttributeValues: {
            ":watchlist": JSON.stringify(req.body.watchlist),
          },
          ReturnValues: "ALL_NEW",
        };

        docClient.update(params, function (err, data) {
          if (err) {
            console.error(
              "Unable to update item. Error JSON:",
              JSON.stringify(err, null, 2)
            );
            res.send(err);
          } else {
            console.log("UpdateItem succeeded:", JSON.stringify(data, null, 2));
            if (data["Attributes"].password) {
              delete data["Attributes"].password;
            }
            res.send(data);
          }
        });
      }
    };
    docClient.scan(params, onScan);
  },
  update_password: (req, res, next) => {
    var params = {
      TableName: "User",
      FilterExpression: "(email = :email)",
      ExpressionAttributeValues: {
        ":email": req.body.email,
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

          if (req.body.password) {
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
          } else if (req.body.magicLink) {
            let params = {
              TableName: "MagicLink",
              FilterExpression: "(#token = :token)",
              ExpressionAttributeNames: { "#token": "token" },
              ExpressionAttributeValues: {
                ":token": req.body.magicLink,
              },
            };

            const onScan = (err, data) => {
              if (err) {
                console.error(
                  "Unable to scan the table. Error JSON:",
                  JSON.stringify(err, null, 2)
                );
              } else {
                if (
                  data["Items"].length > 0 &&
                  data["Items"][0].expdate > new Date().getTime()
                ) {
                  let params = {
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
                  res.send({
                    color: "#f51068",
                    message:
                      "Invalid token: Token may have expired. Try requesting a link again.",
                  });
                }
              }
            };
            docClient.scan(params, onScan);
          } else {
            res.send({
              color: "red",
              message: "Invalid options.",
            });
          }
        } else {
          res.send({
            color: "red",
            message: "Unable to find account with username or email.",
          });
        }
      }
    };
    docClient.scan(params, onScan);
  },
  get: (req, res, next) => {
    var params = {
      TableName: "User",
      Key: {
        id: req.params.id,
      },
      ConsistentRead: true,
    };

    const onScan = (err, data) => {
      if (err) {
        console.error(
          "Unable to scan the table. Error JSON:",
          JSON.stringify(err, null, 2)
        );
        res.send(null);
      } else {
        if (data["Item"]) {
          var user = data["Item"];
          delete user.password;
          res.send(user);
        } else {
          res.send(null);
        }
      }
    };
    docClient.get(params, onScan);
  },
  /**
   * @param {*} user - { id }
   */
  unsubscribe: (req, res, next) => {
    // 1. Get the User
    var getUserByIdParams = {
      TableName: "User",
      FilterExpression: "(id = :id)",
      ExpressionAttributeValues: {
        ":id": req.params.id,
      },
    };
    const onUnsubscribeScan = async (err, data) => {
      if (err) {
        console.error(
          "Unable to scan the table. Error JSON:",
          JSON.stringify(err, null, 2)
        );
        res.send({
          color: "red",
          message: "There was an error getting user by ID.",
        });
      } else {
        // Unsubscribe the user.
        if (data["Items"].length > 0) {
          var user = data["Items"][0];

          if (user.stripe_subscription_id) {
            // 5. If the user has a subscription already cancel it.
            try {
              const deleted = await stripe.subscriptions.del(
                user.stripe_subscription_id
              );
              console.log(`deleted subscription for user: ${user.id}`);
              // 7. update the user with stripe customer id, and pro subscription.
              var setStripeCustomerIdParams = {
                TableName: "User",
                Key: {
                  id: user.id,
                },
                UpdateExpression:
                  "set  plan_name=:plan_name, stripe_subscription_id=:stripe_subscription_id",
                ExpressionAttributeValues: {
                  ":plan_name": "FREE",
                  ":stripe_subscription_id": null,
                },
                ReturnValues: "ALL_NEW",
              };

              docClient.update(setStripeCustomerIdParams, function (err, data) {
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
                  res.send(data["Attributes"]);
                }
              });
            } catch (err) {
              // possibly the stripe customer was deleted.
              res.send(err);
            }
          }
        }
      }
    };
    docClient.scan(getUserByIdParams, onUnsubscribeScan);
  },
  /**
   *
   * @param {*} user - { id }
   * @param {*} payment - { number, exp_month, exp_year, cvc }
   * @param {*} personal - { name, city, country, line1, line2, postal_code, state }
   * @param {*} coupons - *[]
   */
  subscribe: (req, res, next) => {
    // 1. Get the User
    var getUserByIdParams = {
      TableName: "User",
      FilterExpression: "(id = :id)",
      ExpressionAttributeValues: {
        ":id": req.body.user.id,
      },
    };

    const onSubscribeUserScan = async (err, data) => {
      if (err) {
        console.error(
          "Unable to scan the table. Error JSON:",
          JSON.stringify(err, null, 2)
        );
        res.send({
          color: "red",
          message: "There was an error getting user by ID.",
        });
        console.log("failed to get user");
      } else {
        if (data["Items"].length > 0) {
          var user = data["Items"][0];

          let paymentMethod;
          if (!req.body.payment.paymentMethod) {
            // 2. If the user has a payment method already, detach it.
            if (user.stripe_payment_method_id) {
              try {
                await stripe.paymentMethods.detach(
                  user.stripe_payment_method_id
                );
              } catch (err) {
                // Possible that the stripe customer was deleted.
              }
            }

            // 3. Create the stripe payment method.
            try {
              paymentMethod = await stripe.paymentMethods.create({
                type: "card",
                card: {
                  number: req.body.payment.number,
                  exp_month: req.body.payment.exp_month,
                  exp_year: req.body.payment.exp_year,
                  cvc: req.body.payment.cvc,
                },
                billing_details: {
                  address: {
                    city: req.body.personal.city,
                    country: req.body.personal.country,
                    line1: req.body.personal.line1,
                    line2: req.body.personal.line2,
                    postal_code: req.body.personal.postal_code,
                    state: req.body.personal.state,
                  },
                  email: user.email,
                  name: req.body.personal.name,
                },
              });
            } catch (err) {
              console.log(err);
              res.send({
                color: "red",
                message:
                  err && err.raw && err.raw.message
                    ? err.raw.message
                    : "There was an error creating payment method.",
              });
            }
          } else {
            paymentMethod = req.body.payment.paymentMethod;
          }

          let customer;
          if (user.stripe_customer_id) {
            // 3. If the user has a customer already attach the new payment method.
            if (!req.body.payment.paymentMethod) {
              try {
                paymentMethod = await stripe.paymentMethods.attach(
                  paymentMethod.id,
                  { customer: user.stripe_customer_id }
                );
                customer = await stripe.customers.update(
                  user.stripe_customer_id,
                  {
                    invoice_settings: {
                      default_payment_method: paymentMethod.id,
                    },
                    email: user.email,
                    name: user.id,
                  }
                );
                console.log("attached payment method to existing customer");
              } catch (err) {
                // 4. Create the stripe customer.
                customer = await stripe.customers.create({
                  description: "EZFol.io Pro User",
                  email: user.email,
                  name: user.id,
                  payment_method: paymentMethod.id,
                  invoice_settings: {
                    default_payment_method: paymentMethod.id,
                  },
                });
                console.log("created customer");
              }
            } else {
              customer = await stripe.customers.retrieve(
                user.stripe_customer_id
              );
            }
          } else {
            // 4. Create the stripe customer.
            customer = await stripe.customers.create({
              description: user.email,
              payment_method: paymentMethod.id,
              invoice_settings: {
                default_payment_method: paymentMethod.id,
              },
            });
            console.log("created customer");
          }

          if (!customer || customer.statusCode >= 400) {
            res.send({
              color: "red",
              message: "There was an error creating customer account.",
            });
          }

          if (user.stripe_subscription_id) {
            // 5. If the user has a subscription already cancel it.
            try {
              const deleted = await stripe.subscriptions.del(
                user.stripe_subscription_id
              );
              console.log("deleted old subscription");
            } catch (err) {
              // possibly the stripe customer was deleted.
            }
          }

          let subscription;

          let trialEndDate = new Date();
          if (trialEndDate.getMonth() == 11) {
            trialEndDate = new Date(trialEndDate.getFullYear() + 1, 0, 1);
          } else {
            trialEndDate = new Date(
              trialEndDate.getFullYear(),
              trialEndDate.getMonth() + 1,
              1
            );
          }

          const subscriptionData = {
            customer: customer.id,
          };

          if (req.body.coupons && req.body.coupons.length) {
            subscriptionData.discounts = req.body.coupons.map((c) => ({
              coupon: c.id,
            }));

            if (!req.body.coupons.find((c) => c.name === "3 Months Free")) {
              subscriptionData.trial_end = trialEndDate.getTime() / 1000; // Calc 1mo
            }
          }

          if (req.body.payment.plan_name === "ENTERPRISE") {
            subscriptionData.items = [
              { price: process.env.STRIPE_ENTERPRISE_PRICE_ID },
            ];
          } else if (req.body.payment.plan_name === "PLANNER") {
            subscriptionData.items = [
              { price: process.env.STRIPE_PLANNER_PRICE_ID },
            ];
          } else {
            subscriptionData.items = [
              { price: process.env.STRIPE_PRO_PRICE_ID },
            ];
          }
          // 6. Create the subscription.
          subscription = await stripe.subscriptions.create(subscriptionData);

          console.log("created new subscription");

          if (!subscription || subscription.statusCode >= 400) {
            res.send({
              color: "red",
              message: "There was an error creating subscription.",
            });
          }

          // 7. update the user with stripe customer id, and subscription.
          var setStripeCustomerIdParams;

          console.log(req.body.payment);

          if (req.body.payment.plan_name === "ENTERPRISE") {
            const key = genAPIKey();
            setStripeCustomerIdParams = {
              TableName: "User",
              Key: {
                id: user.id,
              },
              UpdateExpression:
                "set stripe_customer_id=:stripe_customer_id, plan_name=:plan_name, stripe_payment_method_id=:stripe_payment_method_id, stripe_subscription_id=:stripe_subscription_id, api_key=:api_key",
              ExpressionAttributeValues: {
                ":stripe_customer_id": customer.id,
                ":plan_name": req.body.payment.plan_name,
                ":stripe_payment_method_id": paymentMethod.id,
                ":stripe_subscription_id": subscription.id,
                ":api_key": key,
              },
              ReturnValues: "ALL_NEW",
            };

            // Email the user the API key

            var mailOptions = {
              from: "hello@ezfol.io",
              to: user.email,
              subject: "Your API Key",
              html:
                "<p>Thank you for subscribing to EZFol.io Enterprise. Here is your API Key</p>" +
                "<b>" +
                key +
                "</b>" +
                "<p>Keep it secret, keep it safe!</p>" +
                "<p>You can now access the api at 'https://ezfolio-enterprise-server.herokuapp.com', documentation " +
                "can be found at 'https://ezfolio-enterprise-server.herokuapp.com/docs/swagger/index.html',  enter 'https://ezfolio-enterprise-server.herokuapp.com/docs/swagger/swagger.json' into the schema search.</p> " +
                "<p>add you're key to your requests as an authorization header 'x-api-key'.</p>" +
                "<p>Sincerely,</p>" +
                "<p> - EZFol.io Customer Service Team",
            };

            transporter.sendMail(mailOptions, function (error, info) {
              if (error) {
                console.log(error);
              } else {
                console.log("customer key sent.");
              }
            });
          } else {
            setStripeCustomerIdParams = {
              TableName: "User",
              Key: {
                id: user.id,
              },
              UpdateExpression:
                "set stripe_customer_id=:stripe_customer_id, plan_name=:plan_name, stripe_payment_method_id=:stripe_payment_method_id, stripe_subscription_id=:stripe_subscription_id",
              ExpressionAttributeValues: {
                ":stripe_customer_id": customer.id,
                ":plan_name": req.body.payment.plan_name,
                ":stripe_payment_method_id": paymentMethod.id,
                ":stripe_subscription_id": subscription.id,
              },
              ReturnValues: "ALL_NEW",
            };
          }

          docClient.update(setStripeCustomerIdParams, function (err, data) {
            if (err) {
              console.error(
                "Unable to update item. Error JSON:",
                JSON.stringify(err, null, 2)
              );
              res.send(err);
            } else {
              res.send(data["Attributes"]);
            }
          });
        } else {
          res.send({
            color: "red",
            message: "Unable to find user with that ID.",
          });
        }
      }
    };
    docClient.scan(getUserByIdParams, onSubscribeUserScan);
  },
  notificationsSubscribe: (req, res, next) => {
    // Check for conflicts.
    var params = {
      TableName: "PushSubscription",
      FilterExpression: "(user_id = :user_id)",
      ExpressionAttributeValues: {
        ":user_id": req.params.id,
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

          // A subscription already exists for this user.
          res.send({
            message: "There is already a subscription with that user.",
          });
        } else {
          // There is no conflict.
          const sub = {
            user_id: req.params.id,
            push_subscription: JSON.stringify(req.body),
          };

          var createParams = {
            TableName: "PushSubscription",
            Item: {
              user_id: { S: sub.user_id },
              push_subscription: { S: sub.push_subscription },
            },
          };

          // Call DynamoDB to add the item to the table
          ddb.putItem(createParams, (err, data) => {
            if (err) {
              console.log("Error", err);
            } else {
              res.send(sub);
            }
          });
        }
      }
    };
    docClient.scan(params, onScan);
  },
  notificationsUnsubscribe: (req, res, next) => {
    if (!req.params.id) {
      res.send({
        error: {
          message: "Invalid params",
        },
      });
      return next();
    } else {
      var params = {
        Key: {
          user_id: {
            S: req.params.id,
          },
        },
        TableName: "PushSubscription",
      };

      // Call DynamoDB to add the item to the table
      ddb.deleteItem(params, (err, data) => {
        if (err) {
          console.log("Error", err);
        } else {
          res.send(data);
          return next();
        }
      });
    }
  },
  getPushSubscription: (req, res, next) => {
    getPushSubscriptionByUserId(req.params.id)
      .then((subscription) => {
        res.send(subscription);
      })
      .catch((err) => {
        res.send(err);
      });
  },
  getPaymentMethods: (req, res, next) => {
    getPaymentMethodsByUserId(req.params.id)
      .then((methods) => {
        res.send(methods);
      })
      .catch((err) => {
        res.send(err);
      });
  },
  getCharges: (req, res, next) => {
    getChargesByUserId(req.params.id)
      .then((methods) => {
        res.send(methods);
      })
      .catch((err) => {
        res.send(err);
      });
  },
  getUpcomingInvoice: async (req, res, next) => {
    try {
      let invoice = await stripe.subscriptions.retrieve(
        "sub_1MowQVLkdIwHu7ixeRlqHVzs"
      );
      res.send(invoice);
    } catch (err) {
      res.send(err);
    }
  },
  getCoupon: async (req, res, next) => {
    try {
      const promotionCodes = await stripe.promotionCodes.list({
        code: req.body.code,
      });
      res.send(promotionCodes);
    } catch (err) {
      res.send(err);
    }
  },
  updatePaymentMethod: async (req, res, next) => {
    let paymentMethod;

    try {
      paymentMethod = await stripe.paymentMethods.create({
        type: "card",
        card: {
          number: req.body.card.number,
          exp_month: req.body.card.exp_month,
          exp_year: req.body.card.exp_year,
          cvc: req.body.card.cvc,
        },
        billing_details: {
          address: {
            city: req.body.billing.city,
            country: req.body.billing.country,
            line1: req.body.billing.line1,
            line2: req.body.billing.line2,
            postal_code: req.body.billing.postal_code,
            state: req.body.billing.state,
          },
          email: req.body.personal.email,
          name: req.body.personal.name,
        },
      });
    } catch (err) {
      res.send({
        color: "red",
        message:
          err && err.raw && err.raw.message
            ? err.raw.message
            : "There was an error creating payment method.",
      });
      return;
    }

    try {
      await stripe.paymentMethods.attach(paymentMethod.id, {
        customer: req.body.personal.stripe_customer_id,
      });
    } catch (err) {
      res.send({
        color: "red",
        message:
          err && err.raw && err.raw.message
            ? err.raw.message
            : "There was an error attaching payment method.",
      });
      return;
    }

    try {
      await stripe.paymentMethods.detach(req.params.id);
    } catch (err) {
      // Possible that the stripe customer was deleted.
    }

    try {
      customer = await stripe.customers.update(
        req.body.personal.stripe_customer_id,
        {
          invoice_settings: {
            default_payment_method: paymentMethod.id,
          },
          email: req.body.personal.email,
          name: req.body.personal.username,
        }
      );
      res.send(customer);
    } catch (err) {
      res.send({
        color: "red",
        message:
          err && err.raw && err.raw.message
            ? err.raw.message
            : "There was an error changing payment method.",
      });
      return;
    }
  },
  inviteClients: (req, res, next) => {
    if (!req.params.id || !req.body.emails) {
      res.send({
        error: {
          message: "Invalid params",
        },
      });
      return next();
    } else {
      // 1. Get the User
      var getUserByIdParams = {
        TableName: "User",
        FilterExpression: "(id = :id)",
        ExpressionAttributeValues: {
          ":id": req.params.id,
        },
      };
      const onAddClientsScan = async (err, data) => {
        if (err) {
          console.error(
            "Unable to scan the table. Error JSON:",
            JSON.stringify(err, null, 2)
          );
          res.send({
            color: "red",
            message: "There was an error getting user by ID.",
          });
        } else {
          if (data["Items"].length > 0) {
            var user = data["Items"][0];

            const clientCount = user.clients
              ? req.body.emails.length + JSON.parse(user.clients).length
              : req.body.emails.length;

            if (clientCount > 100) {
              res.send({
                error: {
                  message: "Too many clients, max allowed is 100",
                },
              });
              return next();
            } else {
              // Create invitation and send email

              req.body.emails.forEach((email) => {
                const invitation = {
                  id: uuidv1(),
                  invitee_email: email,
                  advisor_id: user.id,
                  expdate:
                    Math.floor(new Date().getTime()) + 7 * 24 * 60 * 60 * 1000, // Expire in one week
                };

                var createParams = {
                  TableName: "Invitation",
                  Item: {
                    id: { S: invitation.id },
                    invitee_email: { S: invitation.invitee_email },
                    advisor_id: { S: invitation.advisor_id },
                    expdate: { N: invitation.expdate.toString() },
                  },
                };

                // Call DynamoDB to add the item to the table
                ddb.putItem(createParams, (err, data) => {
                  if (err) {
                    console.log("Error", err);
                    res.send({
                      error: {
                        message:
                          "Failed to create invitation, please try again later. Contact us if error continues.",
                      },
                    });
                    return next();
                  } else {
                    var mailOptions = {
                      from: "alex@ezfol.io",
                      to: email,
                      subject: "You're invited to EZFol.io",
                      html: `<div>
                           <h2>You've been invited to EZFolio by ${
                             user.username || user.email
                           }</h2>
                           <p>EZFol.io is an investment tracking and benchmarking tool that allows you to know in real time how your money is working for you.</p>
                           ${
                             req.body.message
                               ? `<p>"${req.body.message}" -  ${
                                   user.username || user.email
                                 }</p>`
                               : ""
                           }
                           <p>To accept your free account follow the link below. This invitation expires in 7 days.</p>
                           <a href="https://www.ezfol.io/welcome?invitation=${
                             invitation.id
                           }&email=${email}">www.ezfol.io/welcome?invitation=${
                        invitation.id
                      }&email=${email}</a>
                        </div>`,
                    };

                    transporter.sendMail(mailOptions, (error, info) => {});
                  }
                });
              });

              res.send();
              return next();
            }
          }
        }
      };
      docClient.scan(getUserByIdParams, onAddClientsScan);
    }
  },
  getClients: (req, res, next) => {
    if (!req.params.id) {
      res.send({
        error: {
          message: "Invalid params",
        },
      });
      return next();
    } else {
      // Get all clients for this user
      const params = {
        TableName: "Client",
        FilterExpression: "(user_id = :user_id)",
        ExpressionAttributeValues: {
          ":user_id": req.params.id,
        },
      };

      const onScan = async (err, data) => {
        if (err) {
          console.error(
            "Unable to scan the table. Error JSON:",
            JSON.stringify(err, null, 2)
          );
          res.send({
            color: "red",
            message: "There was an error getting clients.",
          });
        } else {
          if (data["Items"].length > 0) {
            var clients = data["Items"];

            // Get all user accounts for all clients

            // Build the filter expression
            let filterExpression = "(";

            // Build the expression attributes
            let attributeValues = {};

            clients.forEach((client, index) => {
              filterExpression += `id = :user${index}`;

              if (index < clients.length - 1) {
                filterExpression += " OR ";
              } else {
                filterExpression += ")";
              }

              attributeValues[`:user${index}`] = client.client_id;
            });

            const params1 = {
              TableName: "User",
              FilterExpression: filterExpression,
              ExpressionAttributeValues: attributeValues,
            };

            const onScan1 = (err, data) => {
              if (err) {
                console.error(
                  "Unable to scan the table. Error JSON:",
                  JSON.stringify(err, null, 2)
                );
                res.send({
                  color: "red",
                  message: "There was an error getting clients.",
                });
              } else {
                if (data["Items"].length > 0) {
                  let clients = JSON.parse(JSON.stringify(data["Items"]));
                  clients = clients.map((c) => {
                    delete c.password;
                    delete c.stripe_customer_id;
                    delete c.stripe_payment_method_id;
                    delete c.stripe_subscription_id;

                    return c;
                  });
                  res.send(clients);
                  return next();
                } else {
                  res.send({
                    color: "red",
                    message: "There was an error getting clients.",
                  });
                  return next();
                }
              }
            };

            docClient.scan(params1, onScan1);
          } else {
            res.send({
              color: "red",
              message: "There was an error getting clients.",
            });
            return next();
          }
        }
      };
      docClient.scan(params, onScan);
    }
  },
  removeClient: (req, res, next) => {
    if (!req.params.id || !req.params.client_id) {
      res.send({
        error: {
          message: "Invalid params",
        },
      });
      return next();
    } else {
      // Get client to delete
      const params = {
        TableName: "Client",
        FilterExpression: "(user_id = :user_id and client_id = :client_id) ",
        ExpressionAttributeValues: {
          ":user_id": req.params.id,
          ":client_id": req.params.client_id,
        },
      };

      const onScan = async (err, data) => {
        if (err) {
          console.error(
            "Unable to scan the table. Error JSON:",
            JSON.stringify(err, null, 2)
          );
          res.send({
            color: "red",
            message: "There was an error getting clients.",
          });
        } else {
          if (data["Items"].length > 0) {
            var client = data["Items"][0];

            // Remove the users PRO account status
            var params = {
              TableName: "User",
              Key: {
                id: req.params.client_id,
              },
              UpdateExpression: "set plan_name = :plan_name",
              ExpressionAttributeValues: {
                ":plan_name": "FREE",
              },
              ReturnValues: "ALL_NEW",
            };

            docClient.update(params, (err, data) => {
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

                const notifyEmail = data["Attributes"].email;

                // Delete the client record
                var params = {
                  Key: {
                    id: {
                      S: client.id,
                    },
                  },
                  TableName: "Client",
                };

                ddb.deleteItem(params, (err, data) => {
                  if (err) {
                    console.log("Error", err);
                  } else {
                    var mailOptions = {
                      from: "ezfolio.contact@gmail.com",
                      to: notifyEmail,
                      subject: "Client update",
                      html: `<div>
                           <p>This message is to inform you that your account is no longer linked as a client. Your advisor has removed you as a client. If you think this is a mistake contact them.</p>
                          
                           <p>Don't worry we still got you :) Your account has been subscribed to our free tier.</p>
                           <a href="https://www.ezfol.io">https://www.ezfol.io</a>
                        </div>`,
                    };

                    transporter.sendMail(mailOptions, (error, info) => {});

                    res.send({
                      message: "Client removed",
                    });
                    return next();
                  }
                });
              }
            });
          } else {
            res.send({
              color: "red",
              message: "There was an error getting clients.",
            });
          }
        }
      };
      docClient.scan(params, onScan);
    }
  },
  inviteAdvisorOnlyClient: async (req, res, next) => {
    try {
      const { email, invitee } = req.body;

      if (!email) {
        return res.status(400).json({
          error: "Email is required",
        });
      }

      if (!invitee) {
        return res.status(400).json({
          error: "Invitee email is required",
        });
      }

      // Step 1: Scan for user by email
      const scanParams = {
        TableName: "User",
        FilterExpression: "email = :email",
        ExpressionAttributeValues: {
          ":email": email,
        },
      };

      const scanResult = await docClient.scan(scanParams).promise();

      if (scanResult.Items.length === 0) {
        return res.status(404).json({
          error: "User not found",
        });
      }

      if (scanResult.Items.length > 1) {
        console.warn(`Multiple users found with email: ${email}`);
      }

      const user = scanResult.Items[0];
      const tempPassword = generateRandomPassword();

      // Step 2: Update user with new temporary password
      const updateParams = {
        TableName: "User",
        Key: {
          id: user.id,
        },
        UpdateExpression:
          "SET password=:password, is_advisor_only=:is_advisor_only",
        ExpressionAttributeValues: {
          ":password": bcrypt.hashSync(tempPassword, 10),
          ":is_advisor_only": false,
        },
        ReturnValues: "ALL_NEW",
      };

      const updateResult = await docClient.update(updateParams).promise();

      // Step 3: Send welcome email with temporary password
      const mailOptions = {
        from: "alex@ezfol.io",
        to: email,
        subject: "Welcome! Your EZFol.io Account Has Been Set Up",
        html: `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 10px rgba(108, 167, 104, 0.1);">
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #6ca768 0%, #5a9156 100%); padding: 30px 40px; text-align: center; border-radius: 8px 8px 0 0;">
            <img src="https://email-campaign-server-9a1eb5eb4201.herokuapp.com/logo.png" alt="EZfolio Logo" style="max-width: 200px; height: auto; filter: brightness(0) invert(1);" />
          </div>
          
          <!-- Content -->
          <div style="padding: 40px;">
            <p style="color: #555555; font-size: 15px; line-height: 1.6; margin: 0 0 15px 0;">You have been invited to join EZFol.io by <strong style="color: #6ca768;">${invitee}</strong>!</p>
            <p style="color: #555555; font-size: 15px; line-height: 1.6; margin: 0 0 25px 0;">Your account has been successfully set up. Below are your login credentials to get started:</p>
            
            <!-- Credentials Box -->
            <div style="background: linear-gradient(135deg, rgba(108, 167, 104, 0.05) 0%, rgba(108, 167, 104, 0.1) 100%); border: 2px solid #6ca768; padding: 25px; border-radius: 8px; margin: 25px 0;">
              <div style="margin-bottom: 15px;">
                <p style="margin: 0; color: #333333; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Email Address</p>
                <p style="margin: 5px 0 0 0; color: #6ca768; font-size: 16px; font-weight: 500;">${email}</p>
              </div>
              <div>
                <p style="margin: 0; color: #333333; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Temporary Password</p>
                <p style="margin: 5px 0 0 0; color: #ffffff; background-color: #6ca768; padding: 8px 12px; border-radius: 4px; display: inline-block; font-family: 'Courier New', monospace; font-size: 16px; font-weight: bold; letter-spacing: 1px;">${tempPassword}</p>
              </div>
            </div>
            
            <!-- Important Notice -->
            <div style="background-color: rgba(255, 193, 7, 0.1); border-left: 4px solid #ffc107; padding: 15px 20px; margin: 25px 0; border-radius: 0 4px 4px 0;">
              <p style="margin: 0; color: #856404; font-size: 15px; font-weight: 500;">
                <span style="font-weight: 600;">⚠️ Important:</span> Please log in and change your password immediately for security reasons.
              </p>
            </div>
            
            <!-- CTA Button -->
            <div style="text-align: center; margin: 30px 0;">
              <a href="https://www.ezfol.io/login?email=${email}" style="background: linear-gradient(135deg, #6ca768 0%, #5a9156 100%); color: #ffffff; padding: 12px 30px; text-decoration: none; border-radius: 25px; font-size: 16px; font-weight: 500; display: inline-block; box-shadow: 0 3px 12px rgba(108, 167, 104, 0.3); transition: all 0.3s ease;">Login to Your Account</a>
            </div>
          </div>
          
          <!-- Footer -->
          <div style="background-color: #f8f9fa; padding: 25px 40px; border-radius: 0 0 8px 8px; border-top: 1px solid rgba(108, 167, 104, 0.1);">
            <p style="font-size: 13px; color: #6c757d; margin: 0; text-align: center; line-height: 1.5;">
              If this doesn't seem right, please <a href="https://www.ezfol.io/contact-us" style="color: #6ca768; text-decoration: none; font-weight: 500;">contact our support team</a> immediately.<br>
              <span style="color: #6ca768; font-weight: 500;">This email was sent from a secure, monitored system.</span>
            </p>
          </div>
        </div>
      `,
      };

      await transporter.sendMail(mailOptions);

      // Step 4: Return success response (don't include password in response)
      res.send(200, {
        success: true,
        message: "User invitation sent successfully. Welcome email delivered.",
        user: {
          id: updateResult.Attributes.id,
          email: updateResult.Attributes.email,
          invitedBy: invitee,
        },
      });
    } catch (error) {
      console.error("Error in invite-user endpoint:", error);

      if (error.code === "ResourceNotFoundException") {
        res.send(500, {
          error: "Database table not found",
        });
        return next();
      }

      res.send(500, {
        error: "Internal server error occurred while sending invitation",
      });
    }

    return next();
  },
  createReport: async (req, res, next) => {
    let browser = null;

    try {
      // Extract user ID from URL params
      const userId = req.params.id;

      if (!userId) {
        return res.send(400, {
          error: "User ID is required in URL parameters",
        });
      }

      // Look up user in DynamoDB
      const getUserParams = {
        TableName: "User",
        Key: {
          id: userId,
        },
      };

      let userData;
      try {
        const userResult = await docClient.get(getUserParams).promise();
        userData = userResult.Item;
      } catch (dbError) {
        console.error("Error fetching user from database:", dbError);
        return res.send(500, {
          error: "Failed to verify user authorization",
          message: dbError.message,
        });
      }

      // Check if user exists
      if (!userData) {
        return res.send(404, {
          error: "User not found",
        });
      }

      // Check if user has required plan
      const allowedPlans = ["PLANNER", "ENTERPRISE"];
      if (!userData.plan_name || !allowedPlans.includes(userData.plan_name)) {
        return res.send(403, {
          error:
            "Unauthorized: This action requires a PLANNER or ENTERPRISE plan",
          currentPlan: userData.plan_name || "No plan",
        });
      }

      const {
        htmlContent,
        portfolio_id,
        bucketName = "ezfolio-user-reports",
        fileName = "ezfolio-report.pdf",
        pdfOptions = {},
        d3Version = "v5",
        waitTime = 2000,
        skipD3Wait = false,
      } = req.body;

      // Validate required fields
      if (!htmlContent) {
        return res.send(400, {
          error: "htmlContent is required in request body",
        });
      }

      if (!portfolio_id) {
        return res.send(400, {
          error: "portfolio_id is required in request body",
        });
      }

      if (!bucketName) {
        return res.send(400, {
          error: "bucketName is required in request body",
        });
      }

      // Generate filename if not provided
      const pdfFileName =
        fileName === "ezfolio-report.pdf"
          ? `ezfolio-report-${portfolio_id.slice(-4)}-${new Date()
              .toISOString()
              .replace(/[:.]/g, "-")
              .replace(/T/, "_")
              .slice(0, 19)}.pdf`
          : fileName;

      // Launch Puppeteer browser
      browser = await puppeteer.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-accelerated-2d-canvas",
          "--no-first-run",
          "--no-zygote",
          "--single-process",
          "--disable-gpu",
          "--no-sandbox",
          "--disable-font-subpixel-positioning",
          "--font-render-hinting=none",
        ],
      });

      const page = await browser.newPage();

      // Create a complete HTML document with D3 support
      const fullHtml = `
      <!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <script src="https://d3js.org/d3.${d3Version}.min.js"></script>
    <link rel="stylesheet" type="text/css" href="https://ezfolio-user-reports.s3.us-east-1.amazonaws.com/index.css" />
    <style>
      @import url("https://fonts.googleapis.com/css2?family=Source+Code+Pro:wght@400;700&display=swap");
      @font-face {
      font-family: "Avenir Pro";
      src: url("https://www.ezfol.io/assets/fonts/AvenirPro/AvenirLTProRoman.otf") format("opentype");
      }
      @font-face {
      font-family: "Avenir Pro";
      src: url("https://www.ezfol.io/assets/fonts/AvenirPro/AvenirLTProOblique.otf") format("opentype");
      font-style: italic;
      }
      @font-face {
      font-family: "Avenir Pro";
      src: url("https://www.ezfol.io/assets/fonts/AvenirPro/AvenirLTProHeavy.otf") format("opentype");
      font-weight: bold;
      }
      @font-face {
      font-family: "Avenir Pro";
      src: url("https://www.ezfol.io/assets/fonts/AvenirPro/AvenirLTProHeavyOblique.otf") format("opentype");
      font-weight: bold;
      font-style: italic;
      }
      @font-face {
      font-family: "Avenir Pro";
      src: url("https://www.ezfol.io/assets/fonts/AvenirPro/AvenirLTProLightOblique.otf") format("opentype");
      font-weight: 300;
      font-style: italic;
      }
      @font-face {
      font-family: "Avenir Pro";
      src: url("https://www.ezfol.io/assets/fonts/AvenirPro/AvenirLTProLight.otf") format("opentype");
      font-weight: 300;
      }
      @font-face {
      font-family: "Avenir Pro";
      src: url("https://www.ezfol.io/assets/fonts/AvenirPro/AvenirLTProMedium.otf") format("opentype");
      font-weight: 600;
      }
      @font-face {
      font-family: "Avenir Pro";
      src: url("https://www.ezfol.io/assets/fonts/AvenirPro/AvenirLTProMediumOblique.otf") format("opentype");
      font-weight: 600;
      font-style: italic;
      }
      body {
      margin: 0.25in;
      }
      @page {
      size: letter; /* or A4 */
      @bottom-right {
      content: counter(page);
      }
      }
      /* Control page breaks */
      .page-break {
      page-break-before: always;
      }
      .no-break {
      page-break-inside: avoid;
      }
      /* Keep headings with following content */
      h1, h2, h3, h4, h5, h6 {
      page-break-after: avoid;
      page-break-inside: avoid;
      }
      /* Avoid orphans and widows */
      p {
      orphans: 3;
      widows: 3;
      }
      img {
      max-width: 100%;
      height: auto;
      page-break-inside: avoid;
      }
      /* Show URLs after links */
      a[href]:after {
      content: " (" attr(href) ")";
      font-size: 10pt;
      color: #666;
      }
      /* Remove default margins */
      * {
      box-sizing: border-box;
      }
      body * {
      font-family: "Avenir Pro", sans-serif;
      }
      .y .domain {
      display: none;
      }
      .x .domain {
      display: none;
      }
      .font-mono,
      code,
      text {
      font-family: "Source Code Pro", "Courier New", monospace !important;
      }
    </style>
  </head>
  <body>
    ${htmlContent}
    <script>
      // Signal when D3 rendering is complete
      window.d3RenderComplete = false;
      
      // Wait for D3 charts to render
      function waitForD3Rendering() {
        return new Promise((resolve) => {
          // Wait for DOM to be ready
          if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", checkRendering);
          } else {
            checkRendering();
          }
      
          function checkRendering() {
            // Give D3 time to execute and render
            setTimeout(() => {
              // Check if there are any ongoing D3 transitions
              const hasActiveTransitions = d3
                .selectAll("*")
                .nodes()
                .some((node) => d3.select(node).transition && d3.select(node).transition()._groups);
      
              if (!hasActiveTransitions) {
                window.d3RenderComplete = true;
                resolve();
              } else {
                // Wait a bit more and check again
                setTimeout(checkRendering, 500);
              }
            }, 1000); // Initial wait for D3 to start rendering
          }
        });
      }
      
      // Start the rendering check
      waitForD3Rendering();
    </script>
  </body>
</html>
      `;

      await page.goto("data:text/html," + encodeURIComponent(fullHtml));

      // Wait for fonts to load
      await page.evaluateOnNewDocument(() => {
        document.fonts.ready.then(() => {
          console.log("Fonts loaded");
        });
      });

      await page.waitForFunction(() => document.fonts.status === "loaded");

      if (!skipD3Wait) {
        // Wait for D3 charts to complete rendering (with fallback)
        try {
          await page.waitForFunction(() => window.d3RenderComplete === true, {
            timeout: 10000,
          });
        } catch (timeoutError) {
          console.log(
            "D3 render detection timed out, proceeding with PDF generation"
          );
        }
      }

      // Additional wait to ensure rendering is complete
      await new Promise((resolve) => setTimeout(resolve, waitTime));

      // Default PDF options optimized for D3/SVG content
      const defaultPdfOptions = {
        format: "A4",
        printBackground: true,
        preferCSSPageSize: false,
        displayHeaderFooter: false,
        margin: {
          top: "20px",
          right: "20px",
          bottom: "20px",
          left: "20px",
        },
      };

      const finalPdfOptions = { ...defaultPdfOptions, ...pdfOptions };
      const pdfBuffer = await page.pdf(finalPdfOptions);

      // Upload to S3
      const uploadParams = {
        Bucket: bucketName,
        Key: pdfFileName,
        Body: pdfBuffer,
        ContentType: "application/pdf",
        ServerSideEncryption: "AES256",
      };

      const uploadResult = await s3.upload(uploadParams).promise();

      // Close browser
      await browser.close();
      browser = null;

      // Update user record with portfolio_reports info
      const reportInfo = {
        name: pdfFileName,
        url: uploadResult.Location,
        createdAt: new Date().toISOString(),
      };

      const updateUserParams = {
        TableName: "User",
        Key: {
          id: userId,
        },
        UpdateExpression: "SET portfolio_reports.#portfolioId = :reportInfo",
        ExpressionAttributeNames: {
          "#portfolioId": portfolio_id,
        },
        ExpressionAttributeValues: {
          ":reportInfo": reportInfo,
        },
      };

      try {
        await docClient.update(updateUserParams).promise();
      } catch (updateError) {
        console.error("Error updating user portfolio_reports:", updateError);

        // If the error is because portfolio_reports doesn't exist, initialize it first
        if (
          updateError.code === "ValidationException" &&
          updateError.message.includes(
            "document path provided in the update expression is invalid"
          )
        ) {
          try {
            const initParams = {
              TableName: "User",
              Key: {
                id: userId,
              },
              UpdateExpression: "SET portfolio_reports = :emptyMap",
              ExpressionAttributeValues: {
                ":emptyMap": {},
              },
            };

            await docClient.update(initParams).promise();

            // Now try the original update again
            await docClient.update(updateUserParams).promise();
          } catch (retryError) {
            console.error(
              "Error on retry updating user portfolio_reports:",
              retryError
            );
            // Note: We don't return an error here since the PDF was successfully created
          }
        }
        // Note: We don't return an error here since the PDF was successfully created
        // This is just a logging operation that shouldn't fail the entire request
      }

      // Return success response
      res.send(200, {
        success: true,
        message: "PDF generated and uploaded successfully",
        s3Location: uploadResult.Location,
        bucket: bucketName,
        key: pdfFileName,
        size: pdfBuffer.length,
        portfolio_id: portfolio_id,
        authorizedUser: {
          id: userId,
          plan: userData.plan_name,
        },
      });
    } catch (error) {
      console.error("Error converting DOM to PDF:", error);

      // Cleanup browser if still open
      if (browser) {
        try {
          await browser.close();
        } catch (closeError) {
          console.error("Error closing browser:", closeError);
        }
      }

      // Handle specific error types
      if (error.code === "NoSuchBucket") {
        return res.send(400, {
          error: `S3 bucket '${req.body.bucketName}' does not exist`,
        });
      }

      if (error.code === "AccessDenied") {
        return res.send(403, {
          error:
            "Access denied to S3 bucket. Check your AWS credentials and permissions.",
        });
      }

      res.send(500, {
        error: "Internal server error",
        message: error.message,
      });
    }

    return next();
  },
  addAdvisorOnlyClient: async (req, res, next) => {
    const requestingUserId = req.params.id;
    const { email } = req.body;

    // Validate input
    if (!email) {
      res.send(400, {
        success: false,
        message: "Email is required",
      });
      return next();
    }

    if (!requestingUserId) {
      res.send(400, {
        success: false,
        message: "User ID is required in URL params",
      });
      return next();
    }

    try {
      // Step 1: Check if user with email already exists (using scan since email is not primary key)
      const existingUserParams = {
        TableName: "User",
        FilterExpression: "email = :email",
        ExpressionAttributeValues: {
          ":email": email,
        },
      };

      const existingUser = await docClient.scan(existingUserParams).promise();

      if (existingUser.Items && existingUser.Items.length > 0) {
        res.send(409, {
          success: false,
          message: "User with this email already exists",
        });
        return next();
      }

      // Step 2: Create new user with the email
      const newUserId = uuidv1(); // Generate unique ID for new user
      const newUserParams = {
        TableName: "User",
        Item: {
          id: newUserId, // Partition key
          email: email,
          created: new Date().toString(),
          watchlist: [].toString(),
          preferences: JSON.stringify(DEFAULT_USER_PREFERENCES),
          plan_name: PLAN_NAMES.PRO,
          is_advisor_only: true,
        },
      };

      await docClient.put(newUserParams).promise();

      // Step 3: Create Client record
      const clientId = uuidv1(); // Generate unique ID for client record
      const clientParams = {
        TableName: "Client",
        Item: {
          id: clientId, // Partition key
          user_id: requestingUserId, // The requesting user's ID
          client_id: newUserId, // The newly created user's ID
        },
      };

      await docClient.put(clientParams).promise();

      // Step 4: Create Portfolio record for the new user
      const portfolioId = uuidv1(); // Using v1 to match your example
      const portfolioParams = {
        TableName: "Portfolio",
        Item: {
          id: portfolioId,
          user_id: newUserId, // The newly created user's ID
          transactions: "[]", // Empty transactions array as string, or set default value
          createTime: new Date().getTime(),
        },
      };

      await docClient.put(portfolioParams).promise();

      // Success response
      res.send(201, {
        success: true,
        message: "Client created successfully",
        data: {
          newUser: {
            id: newUserId,
            email: email,
          },
          clientRecord: {
            id: clientId,
            user_id: requestingUserId,
            client_id: newUserId,
          },
        },
      });

      return next();
    } catch (error) {
      console.error("Error creating client:", error);
      res.send(500, {
        success: false,
        message: "Internal server error",
        error: error.message,
      });
      return next(error);
    }
  },
  getUserById: getUserById,
  getPushSubscriptionByUserId: getPushSubscriptionByUserId,
  updateUser: updateUser,
};

module.exports = UserService;
