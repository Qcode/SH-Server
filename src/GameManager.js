import { knuthShuffle } from 'knuth-shuffle';
import User from './User';
import playerConfigurations from './PlayerConfigurations';

class GameManager {
  constructor(io) {
    this.users = {};
    this.io = io;
    this.gameStage = 'chooseChancellor';
    this.currentPresidentIndex = 0;
  }

  addUser(socket, username) {
    const isHost = this.getUserCount() === 0;
    this.users[socket.id] = new User(socket, username, isHost);
    this.syncUsers();
  }

  canStartGame(socketId) {
    return this.users[socketId].host && this.getUserCount() >= 5;
  }

  startGame() {
    this.io.emit('startGame');
    this.assignRoles();
    this.syncUsers();
    this.setGameStage('chooseChancellor');
  }

  assignRoles() {
    const configuartion = playerConfigurations[this.getUserCount()];
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
      const user = this.users[key];
      switch (options[iterator]) {
        case 'hitler': {
          user.isLiberal = false;
          user.isHitler = true;
          break;
        }
        case 'fascist': {
          user.isLiberal = false;
          user.isHitler = false;
          break;
        }
        default: {
          // Liberal
          user.isLiberal = true;
          user.isHitler = false;
        }
      }
      iterator += 1;
    });

    const president = Math.floor(Math.random() * this.getUserCount());
    this.currentPresidentIndex = president;
    this.users[Object.keys(this.users)[president]].isPresident = true;
  }

  syncUsers() {
    Object.keys(this.users).forEach((userReceivingInformationId) => {
      const userReceivingInformation = this.users[userReceivingInformationId];
      const dataToSend = {};
      dataToSend.primaryUserId = userReceivingInformationId;
      Object.keys(this.users).forEach((userDataId) => {
        dataToSend[userDataId] = this.users[userDataId].getInfo(userReceivingInformation);
      });
      userReceivingInformation.socket.emit('users', dataToSend);
    });
  }

  isValidChancellor(chancellorId, presidentId) {
    // To-Do: Keep track of users for term limits
    return (
      this.users[presidentId].isPresident &&
      this.users[chancellorId] &&
      this.gameStage === 'chooseChancellor'
    );
  }

  nominateChancellor(chancellorId) {
    Object.keys(this.users).forEach((userKey) => {
      this.users[userKey].voteCast = 'uncast';
    });
    this.users[chancellorId].isChancellor = true;
    this.syncUsers();
    this.setGameStage('voteForChancellor');
  }

  logChancellorVote(playerId, vote) {
    this.users[playerId].voteCast = vote;
    const allVotesCast = Object.keys(this.users).reduce(
      (acc, userKey) =>
        (this.users[userKey].voteCast === 0 || this.users[userKey].voteCast === 1) && acc,
      true,
    );

    if (allVotesCast) {
      this.countChancellorVotes();
    }
  }

  countChancellorVotes() {
    const totalVotes = Object.keys(this.users).reduce(
      (acc, userKey) => acc + this.users[userKey].voteCast,
      0,
    );

    if (totalVotes / this.getUserCount() > 0.5) {
      this.setGameStage('presidentPolicySelect');
    } else {
      this.setGameStage('chooseChancellor');
      // To-Do: Add anarchy tracking
      Object.keys(this.users).forEach((userKey) => {
        this.users[userKey].isChancellor = false;
        this.users[userKey].isPresident = false;
      });

      this.currentPresidentIndex += 1;
      if (this.currentPresidentIndex >= this.getUserCount()) {
        this.currentPresidentIndex = 0;
      }

      this.users[Object.keys(this.users)[this.currentPresidentIndex]].isPresident = true;
    }

    this.syncUsers();
  }

  setGameStage(newStage) {
    this.io.emit('gameStage', newStage);
    this.gameStage = newStage;
  }

  static isValidVote(vote) {
    return vote === 0 || vote === 1;
  }

  getUserCount() {
    return Object.keys(this.users).length;
  }
}

export default GameManager;
