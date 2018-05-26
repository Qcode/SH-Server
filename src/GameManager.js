import { knuthShuffle } from 'knuth-shuffle';
import User from './User';
import playerConfigurations from './PlayerConfigurations';

class GameManager {
  constructor(io) {
    this.users = {};
    this.io = io;
    this.gameStage = 'chooseChancellor';
    this.currentPresidentIndex = 0;

    this.drawPile = knuthShuffle(Array(17)
      .fill('fascist', 0, 11)
      .fill('liberal', 11));
    this.discardPile = [];

    this.liberalCardsPlayed = 0;
    this.fascistCardsPlayed = 0;
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
    this.io.emit('SET_GAME_STATE', 'game');
    this.io.emit('SYNC_SCORE', {
      liberal: this.liberalCardsPlayed,
      fascist: this.fascistCardsPlayed,
    });
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
        dataToSend[userDataId] =
          userReceivingInformationId === userDataId
            ? userReceivingInformation.getSelfInfo()
            : this.users[userDataId].getInfo(userReceivingInformation);
      });
      userReceivingInformation.socket.emit('SYNC_USERS', dataToSend);
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
      this.givePresidentCards();
    } else {
      this.chooseNextChancellor();
    }

    this.syncUsers();
  }

  setGameStage(newStage) {
    this.io.emit('SET_GAME_STAGE', newStage);
    this.gameStage = newStage;
  }

  chooseNextChancellor() {
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

  givePresidentCards() {
    if (this.drawPile.length < 3) {
      this.drawPile = this.discardPile;
      this.discardPile = [];
      knuthShuffle(this.drawPile);
    }
    this.setGameStage('presidentPolicySelect');
    const presidentUser = this.getPresidentUser();
    presidentUser.cards = this.drawPile.slice(0, 3);
    this.drawPile.splice(0, 3);
    presidentUser.socket.emit('SYNC_USER', presidentUser.getSelfInfo());
  }

  getPresidentUser() {
    return this.users[Object.keys(this.users).filter(key => this.users[key].isPresident)[0]];
  }

  getChancellorUser() {
    return this.users[Object.keys(this.users).filter(key => this.users[key].isChancellor)[0]];
  }

  static isValidVote(vote) {
    return vote === 0 || vote === 1;
  }

  isValidDiscard(card, userId) {
    return (
      ((this.gameStage === 'presidentPolicySelect' && userId === this.getPresidentUser().id) ||
        (this.gameStage === 'chancellorPolicySelect' && userId === this.getChancellorUser().id)) &&
      this.users[userId].cards.indexOf(card) !== -1
    );
  }

  discardCard(card, userId) {
    const user = this.users[userId];
    this.discardPile.push(card);
    user.cards.splice(user.cards.indexOf(card), 1);

    if (user.isPresident) {
      this.setGameStage('chancellorPolicySelect');

      const chancellor = this.getChancellorUser();
      chancellor.cards = user.cards;
      chancellor.socket.emit('SYNC_USER', chancellor.getSelfInfo());
    } else if (user.isChancellor) {
      // Only card left, so hence card played;
      if (user.cards[0] === 'liberal') {
        this.liberalCardsPlayed += 1;
      } else {
        this.fascistCardsPlayed += 1;
        // Check for execution of presidential powers
      }

      if (this.liberalCardsPlayed === 5) {
        this.emitGameOver('LIBERALS_WIN');
      } else if (this.fascistCardsPlayed === 6) {
        this.emitGameOver('FASCISTS_WIN');
      } else {
        // Continue game
        this.io.emit('SYNC_SCORE', {
          liberal: this.liberalCardsPlayed,
          fascist: this.fascistCardsPlayed,
        });

        this.chooseNextChancellor();
        this.syncUsers();
      }
    }
    user.cards = [];
    user.socket.emit('SYNC_USER', user.getSelfInfo());
  }

  getUserCount() {
    return Object.keys(this.users).length;
  }

  emitGameOver(gameOverType) {
    this.io.emit('SET_GAME_STATE', 'gameOver');
    this.io.emit('GAME_OVER_REASON', gameOverType);
  }
}

export default GameManager;
