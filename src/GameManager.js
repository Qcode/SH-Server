import User from './User';

class GameManager {
  constructor() {
    this.users = {};
  }

  addUser(socket, username) {
    this.users[socket.id] = new User(socket, username);
  }
}

export default GameManager;
