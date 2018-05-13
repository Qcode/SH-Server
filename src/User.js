class User {
  constructor(socket, username, isHost) {
    this.socket = socket;
    this.username = username;
    this.host = isHost;
  }

  getInfo() {
    const { socket, ...info } = this;
    return info;
  }
}

export default User;
