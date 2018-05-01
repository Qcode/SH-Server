import User from './User';

class GameManager {
  constructor() {
    this.users = {};
  }

  addUser(socket) {
    this.users[socket.id] = new User(socket);
  }
}

export default GameManager;
