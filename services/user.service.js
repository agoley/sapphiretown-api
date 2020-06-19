let AWS = require("aws-sdk");
const { v1: uuidv1 } = require("uuid");
const bcrypt = require("bcrypt");

AWS.config.update({
  region: "us-east-1",
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

var ddb = new AWS.DynamoDB({ apiVersion: "2012-08-10" });
var docClient = new AWS.DynamoDB.DocumentClient();

const UserService = {
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
      } else {
        if (data["Items"].length > 0) {
          var user = data["Items"][0];

          bcrypt.compare(req.body.password, user.password, function (
            err,
            doesMatch
          ) {
            if (doesMatch) {
              //log him in
              delete user.password;
              res.send(user);
            } else {
              //go away
              res.send();
            }
          });
        } else {
          res.send();
        }
        return next();
      }
    };
    docClient.scan(params, onScan);
  },
  create: (req, res, next) => {
    const usr = {
      id: uuidv1(),
      username: req.body.username,
      email: req.body.email,
      password: bcrypt.hashSync(req.body.password, 10)
    };

    var params = {
      TableName: "User",
      Item: {
        id: { S: usr.id },
        username: { S: usr.username },
        email: { S: usr.email },
        password: { S: usr.password },
      },
    };

    // Call DynamoDB to add the item to the table
    ddb.putItem(params, (err, data) => {
      if (err) {
        console.log("Error", err);
      } else {
        delete usr.password;
        res.send(usr);
        return next();
      }
    });
  },
};

module.exports = UserService;
