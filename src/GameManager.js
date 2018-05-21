import { knuthShuffle } from 'knuth-shuffle';
import User from './User';
import playerConfigurations from './PlayerConfigurations';

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

  canStartGame(socketId) {
    return this.users[socketId].host && Object.keys(this.users).length >= 5;
  }

  startGame() {
    this.io.emit('startGame');
    this.assignRoles();
    this.syncUsers();
  }

  assignRoles() {
    const configuartion = playerConfigurations[Object.keys(this.users).length];
    const options = [];
    options.push('hitler');
    for (let x = 0; x < configuartion.fascists - 1; x += 1) {
      options.push('fascist');
    }
    for (let x = 0; x < configuartion.liberals; x += 1) {
      options.push('liberal');
    }
    knuthShuffle(options);
    let iterator = 0;
    Object.keys(this.users).forEach((key) => {
      switch (options[iterator]) {
        case 'hitler': {
          this.users[key].isLiberal = false;
          this.users[key].isHitler = true;
          break;
        }
        case 'fascist': {
          this.users[key].isLiberal = false;
          this.users[key].isHitler = false;
          break;
        }
        default: {
          // Liberal
          this.users[key].isLiberal = true;
          this.users[key].isHitler = false;
        }
      }
      iterator += 1;
    });
  }

  syncUsers() {
    Object.keys(this.users).forEach((userReceivingInformation) => {
      const dataToSend = {};
      dataToSend.primaryUserId = userReceivingInformation;
      Object.keys(this.users).forEach((userData) => {
        dataToSend[userData] = this.users[userData].getInfo(this.users[userReceivingInformation]);
      });
      this.users[userReceivingInformation].socket.emit('users', dataToSend);
    });
  }
}

export default GameManager;
