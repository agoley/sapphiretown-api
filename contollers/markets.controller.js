const MarketsController = {
    markets: (server) => {
    server.get('/markets', (req, res, next) => {
      res.send('Hello from route 1');
      return next();
    });
  }
}

module.exports = MarketsController;

