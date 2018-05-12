class User {
  constructor(socket, username, isHost) {
    this.socket = socket;
    this.username = username;
    this.host = isHost;
  }
}

export default User;
