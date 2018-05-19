import User from './User';

class GameManager {
  constructor(io) {
    this.users = {};
    this.io = io;
  }

  addUser(socket, username) {
    const isHost = Object.keys(this.users).length === 0;
    this.users[socket.id] = new User(socket, username, isHost);
    this.syncUsers();
  }

  syncUsers() {
    const dataToSend = {};
    Object.keys(this.users).forEach((key) => {
      dataToSend[key] = this.users[key].getInfo();
    });
    Object.keys(this.users).forEach((key) => {
      dataToSend.primaryUserId = key;
      this.users[key].socket.emit('users', dataToSend);
    });
  }
}

export default GameManager;
