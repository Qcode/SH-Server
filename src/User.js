class User {
  constructor(socket, username) {
    this.socket = socket;
    this.username = username;

    console.log(this.socket.id, this.username);
  }
}

export default User;
