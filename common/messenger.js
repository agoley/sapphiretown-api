import { Subject } from "rxjs";
const { v1: uuidv1 } = require("uuid");

class Messenger {
  constructor(timeout) {
    this.messages = [];
    this.responses = new Subject();
    this.timeout = timeout;
  }

  load(message) {
    if (this.messages.length === 0) {
      this.interval = setInterval(this.next.bind(this), this.timeout || 250);
    }
    const id = uuidv1();
    this.messages.push({
      request: message,
      id: id,
    });
    return id;
  }

  next() {
    const message = this.messages.shift();
    if (this.messages.length === 0) {
      clearInterval(this.interval);
    }
    message.request
      .then((res) => {
        return this.responses.next({ id: message.id, data: res.body });
      })
      .catch((err) => this.responses.next({ id: message.id, err: err }));
  }
}

module.exports = {
  yahoo: new Messenger(350),
  cmc: new Messenger(100),
  yahooLowLatency: new Messenger(5),

};
