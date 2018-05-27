import { knuthShuffle } from 'knuth-shuffle';
import User from './User';
import playerConfigurations from './PlayerConfigurations';
import presidentialPowers from './PresidentialPowers';

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
    this.failedGovernmentCounter = 0;

    this.gameOver = false;
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
    Object.values(this.users).forEach((user) => {
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
    Object.values(this.users)[president].isPresident = true;
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
      chancellorId !== presidentId &&
      this.users[chancellorId] &&
      !this.users[chancellorId].isDead &&
      !this.users[chancellorId].isTermLimited &&
      this.gameStage === 'chooseChancellor'
    );
  }

  nominateChancellor(chancellorId) {
    Object.values(this.users).forEach((user) => {
      user.voteCast = 'uncast';
    });
    this.users[chancellorId].isChancellor = true;
    this.syncUsers();
    this.setGameStage('voteForChancellor');
  }

  logChancellorVote(playerId, vote) {
    this.users[playerId].voteCast = vote;
    const allVotesCast = Object.values(this.users).reduce(
      (acc, user) => (user.voteCast === 0 || user.voteCast === 1 || user.isDead) && acc,
      true,
    );

    if (allVotesCast) {
      this.countChancellorVotes();
    }
  }

  countChancellorVotes() {
    const totalVotes = Object.values(this.users).reduce(
      (acc, user) => acc + (!user.isDead ? user.voteCast : 0),
      0,
    );

    if (totalVotes / this.getActiveUserCount() > 0.5) {
      // Motion passed
      if (this.getChancellorUser().isHitler && this.fascistCardsPlayed >= 3) {
        this.emitGameOver('HITLER_ELECTED');
        return;
      }
      this.adjustTermLimits();
      this.givePresidentCards();
    } else {
      this.failedGovernmentCounter += 1;
      if (this.failedGovernmentCounter === 3) {
        this.failedGovernmentCounter = 0;
        this.io.emit(
          'GET_MEMO',
          `A ${this.drawPile[0]} policy was passed because of 3 failed governments`,
        );
        this.passTopPolicy();
        this.drawPileShuffle();
        Object.values(this.users).forEach((user) => {
          user.isTermLimited = false;
        });
      }
      // Motion failed
      this.chooseNextChancellor();
    }
    this.io.emit('SYNC_FAILED_GOVERNMENTS', this.failedGovernmentCounter);
  }

  setGameStage(newStage) {
    this.io.emit('SET_GAME_STAGE', newStage);
    this.gameStage = newStage;
  }

  chooseNextChancellor() {
    this.setGameStage('chooseChancellor');
    Object.values(this.users).forEach((user) => {
      user.isChancellor = false;
      user.isPresident = false;
    });

    const presidentIndexToUser = index => Object.values(this.users)[index];

    let chosenPresident = false;
    while (!chosenPresident) {
      chosenPresident = true;
      this.currentPresidentIndex += 1;
      if (this.currentPresidentIndex >= this.getUserCount()) {
        this.currentPresidentIndex = 0;
      }
      if (presidentIndexToUser(this.currentPresidentIndex).isDead) {
        chosenPresident = false;
      }
    }

    presidentIndexToUser(this.currentPresidentIndex).isPresident = true;
    this.syncUsers();
  }

  givePresidentCards() {
    this.drawPileShuffle();
    this.setGameStage('presidentPolicySelect');
    const presidentUser = this.getPresidentUser();
    presidentUser.cards = this.drawPile.slice(0, 3);
    this.drawPile.splice(0, 3);
    presidentUser.socket.emit('SYNC_USER', presidentUser.getSelfInfo());
  }

  getPresidentUser() {
    return Object.values(this.users).filter(user => user.isPresident)[0];
  }

  getChancellorUser() {
    return Object.values(this.users).filter(user => user.isChancellor)[0];
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
      this.passPolicy(user.cards[0]);

      // Passing policy may have ended game. If not, then...
      if (!this.gameOver) {
        let executedFascistPolicy = false;
        if (user.cards[0] === 'fascist' && this.getFascistPower() !== 'none') {
          executedFascistPolicy = true;
          this.setGameStage('fascistPower');
          this.io.emit('FASCIST_POWER', this.getFascistPower());
          if (this.getFascistPower() === 'cardPeek') {
            this.drawPileShuffle();
            this.getPresidentUser().socket.emit('FASCIST_INFO', this.drawPile.slice(0, 3));
          }
        }

        if (!executedFascistPolicy) {
          // Continue game
          this.chooseNextChancellor();
        }
      }
    }
    user.cards = [];
    user.socket.emit('SYNC_USER', user.getSelfInfo());
  }

  getUserCount() {
    return Object.keys(this.users).length;
  }

  getActiveUserCount() {
    return Object.values(this.users).filter(user => !user.isDead).length;
  }

  emitGameOver(gameOverType) {
    this.io.emit('SET_GAME_STATE', 'gameOver');
    this.io.emit('GAME_OVER_REASON', gameOverType);
    this.gameOver = true;
  }

  getGameSize() {
    return {
      5: 'small',
      6: 'small',
      7: 'medium',
      8: 'medium',
      9: 'large',
      10: 'large',
    }[this.getUserCount()];
  }

  drawPileShuffle() {
    if (this.drawPile.length < 3) {
      this.drawPile = this.discardPile;
      this.discardPile = [];
      knuthShuffle(this.drawPile);
    }
  }

  canEnactFascistPower(userEnacting, userToEnact) {
    const ableToEnactOnUser = userToEnact ? !this.users[userToEnact].isDead : true;
    return (
      this.gameStage === 'fascistPower' &&
      this.getPresidentUser().id === userEnacting &&
      this.getPresidentUser().id !== userToEnact &&
      ableToEnactOnUser
    );
  }

  enactFascistPower(info) {
    const memoToUsersExcludingPresident = (string) => {
      Object.values(this.users)
        .filter(user => !user.isPresident)
        .forEach(user => user.socket.emit('GET_MEMO', string));
    };

    const actions = {
      cardPeek: () => {
        memoToUsersExcludingPresident(`${this.getPresidentUser().username} has seen the top 3 cards in the draw pile.`);
      },
      kill: () => {
        memoToUsersExcludingPresident(`${this.getPresidentUser().username} has executed ${this.users[info].username}.`);
        this.users[info].isDead = true;
      },
      inspect: () => {
        memoToUsersExcludingPresident(`${this.getPresidentUser().username} has inspected ${this.users[info].username}'s party`);
        const partyAffiliation = this.users[info].isLiberal ? 'liberal' : 'fascist';
        this.getPresidentUser().socket.emit(
          'GET_MEMO',
          `${this.users[info].username} is a ${partyAffiliation}`,
        );
      },
      election: () => {
        memoToUsersExcludingPresident(`${this.getPresidentUser().username} has chosen ${
          this.users[info].username
        } to be president through a special election`);
        this.setGameStage('chooseChancellor');
        Object.values(this.users).forEach((user) => {
          user.isChancellor = false;
          user.isPresident = false;
        });
        this.users[info].isPresident = true;
        this.syncUsers();
      },
    };

    if (this.getFascistPower() === 'kill' && this.users[info].isHitler) {
      this.emitGameOver('HITLER_SHOT');
      return;
    }

    actions[this.getFascistPower()]();
    if (this.getFascistPower() !== 'election') {
      this.chooseNextChancellor();
    }
  }

  getFascistPower() {
    return presidentialPowers[this.getGameSize()][this.fascistCardsPlayed - 1];
  }

  adjustTermLimits() {
    Object.values(this.users).forEach((user) => {
      user.isTermLimited = false;
    });
    this.getChancellorUser().isTermLimited = true;
    if (this.getActiveUserCount() > 5) {
      this.getPresidentUser().isTermLimited = true;
    }
    this.syncUsers();
  }

  passTopPolicy() {
    this.passPolicy(this.drawPile[0]);
    this.drawPile.splice(0, 1);
  }

  passPolicy(card) {
    this.failedGovernmentCounter = 0;
    if (card === 'liberal') {
      this.liberalCardsPlayed += 1;
    } else {
      this.fascistCardsPlayed += 1;
    }

    this.io.emit('SYNC_SCORE', {
      liberal: this.liberalCardsPlayed,
      fascist: this.fascistCardsPlayed,
    });

    this.io.emit('SYNC_FAILED_GOVERNMENTS', this.failedGovernmentCounter);

    if (this.liberalCardsPlayed === 5) {
      this.emitGameOver('LIBERALS_WIN');
    } else if (this.fascistCardsPlayed === 6) {
      this.emitGameOver('FASCISTS_WIN');
    }
  }
}

export default GameManager;
