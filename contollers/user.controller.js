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
      try {
        _user.get(req, res, next);
      } catch (err) {
        console.error("/api/v3/users/:id error: " + err);
      }
    });
  },
  find: (server) => {
    server.get("/api/v4/users/:identifier", ...middleware, (req, res, next) => {
      try {
        _user.find(req, res, next);
      } catch (err) {
        console.error("/api/v4/users/:identifier error: " + err);
      }
    });
  },
  auth: (server) => {
    server.post("/api/v1/users/auth", ...middleware, (req, res, next) => {
      try {
        _user.auth(req, res, next);
      } catch (err) {
        console.error("/api/v1/users/auth error: " + err);
      }
    });
  },
  authenticate: (server) => {
    server.post(
      "/api/v2/users/authenticate",
      ...middleware,
      (req, res, next) => {
        try {
          _user.authenticate(req, res, next);
        } catch (err) {
          console.error("/api/v2/users/authenticate error: " + err);
        }
      }
    );
  },
  create: (server) => {
    server.post("/api/v1/users", ...middleware, (req, res, next) => {
      try {
        _user.create(req, res, next);
      } catch (err) {
        console.error("/api/v1/users error: " + err);
      }
    });
  },
  createV3: (server) => {
    server.post("/api/v3/users", ...middleware, (req, res, next) => {
      try {
        _user.createV3(req, res, next);
      } catch (err) {
        console.error("/api/v3/users error: " + err);
      }
    });
  },
  forgot: (server) => {
    server.post("/api/v1/forgot", ...middleware, (req, res, next) => {
      try {
        _user.forgot(req, res, next);
      } catch (err) {
        console.error("/api/v1/forgot error: " + err);
      }
    });
  },
  magicLink: (server) => {
    server.post("/api/v1/magicLink", ...middleware, (req, res, next) => {
      try {
        _user.magicLink(req, res, next);
      } catch (err) {
        console.error("/api/v1/magicLink error: " + err);
      }
    });
  },
  reset: (server) => {
    server.post("/api/v1/reset", ...middleware, (req, res, next) => {
      try {
        _user.reset(req, res, next);
      } catch (err) {
        console.error("/api/v1/reset error: " + err);
      }
    });
  },
  update: (server) => {
    server.post("/api/v2/users", ...middleware, (req, res, next) => {
      try {
        _user.update(req, res, next);
      } catch (err) {
        console.error("/api/v2/users error: " + err);
      }
    });
  },
  update_watchlist: (server) => {
    server.post(
      "/api/v2/users/:id/watchlist",
      ...middleware,
      (req, res, next) => {
        try {
          _user.update_watchlist(req, res, next);
        } catch (err) {
          console.error("/api/v2/users/:id/watchlist error: " + err);
        }
      }
    );
  },
  update_password: (server) => {
    server.post(
      "/api/v2/users/:id/password",
      ...middleware,
      (req, res, next) => {
        try {
          _user.update_password(req, res, next);
        } catch (err) {
          console.error("/api/v2/users/:id/password error: " + err);
        }
      }
    );
  },
  getCoupon: (server) => {
    server.post("/api/v2/users/coupons", ...middleware, (req, res, next) => {
      try {
        _user.getCoupon(req, res, next);
      } catch (err) {
        console.error("/api/v2/users/coupons error: " + err);
      }
    });
  },
  subscribe: (server) => {
    server.post(
      "/api/v2/users/:id/subscribe",
      ...middleware,
      (req, res, next) => {
        try {
          _user.subscribe(req, res, next);
        } catch (err) {
          console.error("/api/v2/users/:id/subscribe error: " + err);
        }
      }
    );
  },
  unsubscribe: (server) => {
    server.post(
      "/api/v2/users/:id/unsubscribe",
      ...middleware,
      (req, res, next) => {
        try {
          _user.unsubscribe(req, res, next);
        } catch (err) {
          console.error("/api/v2/users/:id/unsubscribe error: " + err);
        }
      }
    );
  },

  notificationsSubscribe: (server) => {
    server.post(
      "/api/v2/users/:id/notifications/subscribe",
      ...middleware,
      (req, res, next) => {
        try {
          _user.notificationsSubscribe(req, res, next);
        } catch (err) {
          console.error(
            "/api/v2/users/:id/notifications/subscribe error: " + err
          );
        }
      }
    );
  },
  notificationsUnsubscribe: (server) => {
    server.post(
      "/api/v2/users/:id/notifications/unsubscribe",
      ...middleware,
      (req, res, next) => {
        try {
          _user.notificationsUnsubscribe(req, res, next);
        } catch (err) {
          console.error(
            "/api/v2/users/:id/notifications/unsubscribe error: " + err
          );
        }
      }
    );
  },
  pushSubscription: (server) => {
    server.get(
      "/api/v4/users/:id/push-subscription",
      ...middleware,
      (req, res, next) => {
        try {
          _user.getPushSubscription(req, res, next);
        } catch (err) {
          console.error("/api/v4/users/:id/push-subscription error: " + err);
        }
      }
    );
  },
  paymentMethods: (server) => {
    server.get(
      "/api/v4/users/:id/payment-methods",
      ...middleware,
      (req, res, next) => {
        try {
          _user.getPaymentMethods(req, res, next);
        } catch (err) {
          console.error("/api/v4/users/:id/payment-methods error: " + err);
        }
      }
    );
  },

  charges: (server) => {
    server.get("/api/v4/users/:id/charges", ...middleware, (req, res, next) => {
      try {
        _user.getCharges(req, res, next);
      } catch (err) {
        console.error("/api/v4/users/:id/charges error: " + err);
      }
    });
  },

  updatePaymentMethod: (server) => {
    server.post(
      "/api/v2/payment-methods/:id",
      ...middleware,
      (req, res, next) => {
        try {
          _user.updatePaymentMethod(req, res, next);
        } catch (err) {
          console.error("/api/v2/payment-methods/:id error: " + err);
        }
      }
    );
  },

  getUpcomingInvoice: (server) => {
    server.get("/api/v2/invoice/:id", ...middleware, (req, res, next) => {
      try {
        _user.getUpcomingInvoice(req, res, next);
      } catch (err) {
        console.error("/api/v2/invoice/:id error: " + err);
      }
    });
  },

  inviteClients: (server) => {
    server.post("/api/v4/:id/clients", ...middleware, (req, res, next) => {
      try {
        _user.inviteClients(req, res, next);
      } catch (err) {
        console.error("/api/v4/:id/clients error: " + err);
      }
    });
  },
  getClients: (server) => {
    server.get("/api/v4/:id/clients", ...middleware, (req, res, next) => {
      try {
        _user.getClients(req, res, next);
      } catch (err) {
        console.error("/api/v4/:id/clients error: " + err);
      }
    });
  },
  removeClient: (server) => {
    server.del(
      "/api/v4/:id/clients/:client_id",
      ...middleware,
      (req, res, next) => {
        try {
          _user.removeClient(req, res, next);
        } catch (err) {
          console.error("/api/v4/:id/clients/:id error: " + err);
        }
      }
    );
  },
  addAdvisorOnlyClient: (server) => {
    server.post(
      "/api/v4/:id/advisor-only-client",
      ...middleware,
      (req, res, next) => {
        try {
          _user.addAdvisorOnlyClient(req, res, next);
        } catch (err) {
          console.error("/api/v4/:id/advisor-only-client error: " + err);
        }
      }
    );
  },
  inviteAdvisorOnlyClient: (server) => {
    server.post(
      "/api/v4/:id/advisor-only-client/invite",
      ...middleware,
      (req, res, next) => {
        try {
          _user.inviteAdvisorOnlyClient(req, res, next);
        } catch (err) {
          console.error("/api/v4/:id/advisor-only-client/invite error: " + err);
        }
      }
    );
  },
};

module.exports = UserController;
