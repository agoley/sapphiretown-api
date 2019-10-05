class Cache {
  constructor() {
    this.local = {};
  }

  save(key, value) {
    this.local[key] = {
      value: value,
      timestamp: new Date().getTime()
    };
  }

  get(key) {
    if (this.local[key]) {
      if (this.isReadyToUpdate(this.local[key].timestamp)) {
        // The cache needs to update.
        return false;
      } else {
        // The cached value exists and does not require an update.
        return this.local[key].value;
      }
    } else {
      // The cached value doesnt exist.
      return false;
    }
  }

  isReadyToUpdate(timestamp) {
    var d = new Date().getTime() - timestamp;
    if (d > 1000 * 60 * 5) {
      // The cached value is over 5 minutes old.
      return true;
    }
    return false;
  }
}

module.exports = Cache;
