import User from './User';

class GameManager {
  constructor() {
    this.users = {};
  }

  addUser(socket, username) {
    const isHost = Object.keys(this.users).length === 0;
    this.users[socket.id] = new User(socket, username, isHost);
  }

  isUserHost(userId) {
    return this.users[userId].host;
  }
}

export default GameManager;
