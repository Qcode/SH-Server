import { knuthShuffle } from 'knuth-shuffle';
import User from './User';
import playerConfigurations from './PlayerConfigurations';
import presidentialPowers from './PresidentialPowers';

class GameManager {
  constructor(io) {
    this.users = {};
    this.io = io;
    this.resetState();
    // Set to false when game starts
    this.gameOver = true;
  }

  addUser(socket, username) {
    const isHost = this.getUserCount() === 0;
    this.users[socket.id] = new User(socket, username, isHost);
    this.syncUsers();
  }

  canStartGame(socketId) {
    return (
      this.users[socketId] &&
      this.users[socketId].host &&
      this.getUserCount() >= 5 &&
      this.gameOver &&
      !this.hasDisconnectedUsers()
    );
  }

  startGame() {
    this.resetState();
    this.gameOver = false;
    this.io.emit('SYNC_SCORE', {
      liberal: this.liberalCardsPlayed,
      fascist: this.fascistCardsPlayed,
    });
    this.assignRoles();
    this.syncUsers();
    this.setGameStage('chooseChancellor');
    this.io.emit('SET_GAME_STATE', 'game');
  }

  resetState() {
    this.gameStage = 'chooseChancellor';
    this.currentPresidentIndex = 0;

    this.drawPile = knuthShuffle(Array(17)
      .fill('fascist', 0, 11)
      .fill('liberal', 11));
    this.discardPile = [];

    this.liberalCardsPlayed = 0;
    this.fascistCardsPlayed = 0;
    this.failedGovernmentCounter = 0;
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
    const liberalRoleImages = knuthShuffle([1, 2, 3, 4, 5, 6]);
    const fascistRoleImages = knuthShuffle([1, 2, 3]);
    knuthShuffle(options);
    let iterator = 0;
    Object.values(this.users).forEach((user) => {
      user.isPresident = false;
      user.isChancellor = false;
      switch (options[iterator]) {
        case 'hitler': {
          user.isLiberal = false;
          user.isHitler = true;
          break;
        }
        case 'fascist': {
          user.isLiberal = false;
          user.isHitler = false;
          user.roleImage = fascistRoleImages.pop();
          break;
        }
        default: {
          // Liberal
          user.isLiberal = true;
          user.isHitler = false;
          user.roleImage = liberalRoleImages.pop();
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
            : this.users[userDataId].getInfo(this.deservesFullInfo(userReceivingInformation));
      });
      userReceivingInformation.socket.emit('SYNC_USERS', dataToSend);
    });
  }

  deservesFullInfo(user) {
    return (
      (this.getGameSize() === 'small' && !user.isLiberal) ||
      (this.getGameSize() !== 'small' && !user.isLiberal && !user.isHitler)
    );
  }

  isValidChancellor(chancellorId, presidentId) {
    // To-Do: Keep track of users for term limits
    return (
      this.users[presidentId] &&
      this.users[chancellorId] &&
      this.users[presidentId].isPresident &&
      chancellorId !== presidentId &&
      this.users[chancellorId] &&
      !this.users[chancellorId].isDead &&
      !this.users[chancellorId].isTermLimited &&
      this.gameStage === 'chooseChancellor' &&
      !this.hasDisconnectedUsers()
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
      this.increaseFailedGovernments();
      // Motion failed
      this.chooseNextChancellor();
    }
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
      user.usedVeto = false;
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

  isValidVote(userId, vote) {
    return this.users[userId] && !this.hasDisconnectedUsers() && (vote === 0 || vote === 1);
  }

  isValidDiscard(card, userId) {
    return (
      this.users[userId] &&
      ((this.gameStage === 'presidentPolicySelect' && userId === this.getPresidentUser().id) ||
        (this.gameStage === 'chancellorPolicySelect' && userId === this.getChancellorUser().id)) &&
      this.users[userId].cards.indexOf(card) !== -1 &&
      !this.hasDisconnectedUsers()
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

    const dataToSend = {};

    Object.values(this.users).forEach((user) => {
      user.isDead = false;
      user.isChancellor = false;
      user.isPresident = false;
      user.voteCast = 'uncast';
      dataToSend[user.id] = user.getSelfInfo();
    });

    // Reveal everyone's roles in game over screen
    Object.values(this.users).forEach((user) => {
      dataToSend.primaryUserId = user.id;
      user.socket.emit('SYNC_USERS', dataToSend);
    });

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
    if (this.users[userEnacting] && ((userToEnact && this.users[userToEnact]) || !userToEnact)) {
      const ableToEnactOnUser = userToEnact ? !this.users[userToEnact].isDead : true;
      return (
        this.gameStage === 'fascistPower' &&
        this.getPresidentUser().id === userEnacting &&
        this.getPresidentUser().id !== userToEnact &&
        ableToEnactOnUser &&
        !this.hasDisconnectedUsers()
      );
    }
    return false;
  }

  enactFascistPower(info) {
    const memoToUsersExcludingPresident = (message) => {
      Object.values(this.users)
        .filter(user => !user.isPresident)
        .forEach(user => user.socket.emit('GET_MEMO', message));
    };

    const actions = {
      cardPeek: () => {
        memoToUsersExcludingPresident({
          text: `${this.getPresidentUser().username} has seen the top 3 cards in the draw pile.`,
          graphics: [this.getPresidentUser().id],
        });
      },
      kill: () => {
        memoToUsersExcludingPresident({
          text: `${this.getPresidentUser().username} has executed ${this.users[info].username}.`,
          graphics: [this.getPresidentUser().id, info],
        });
        this.users[info].isDead = true;
      },
      inspect: () => {
        memoToUsersExcludingPresident({
          text: `${this.getPresidentUser().username} has inspected ${
            this.users[info].username
          }'s party`,
          graphics: [this.getPresidentUser().id, info],
        });
        const partyAffiliation = this.users[info].isLiberal ? 'liberal' : 'fascist';
        this.getPresidentUser().socket.emit('GET_MEMO', {
          text: `${this.users[info].username} is a ${partyAffiliation}`,
          graphics: [`${partyAffiliation}-affiliation`],
        });
      },
      election: () => {
        memoToUsersExcludingPresident({
          text: `${this.getPresidentUser().username} has chosen ${
            this.users[info].username
          } to be president through a special election`,
          graphics: [this.getPresidentUser().id, info],
        });
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

  canSubmitVetoRequest(userId) {
    return (
      this.users[userId] &&
      this.fascistCardsPlayed === 5 &&
      userId === this.getChancellorUser().id &&
      !this.getChancellorUser().usedVeto &&
      !this.hasDisconnectedUsers()
    );
  }

  sendVetoRequest() {
    this.getChancellorUser().usedVeto = true;
    this.syncUsers();
  }

  canRespondVetoRequest(userId) {
    return (
      this.users[userId] &&
      this.fascistCardsPlayed === 5 &&
      userId === this.getPresidentUser().id &&
      this.getChancellorUser().usedVeto &&
      !this.getPresidentUser().usedVeto &&
      !this.hasDisconnectedUsers()
    );
  }

  handleVetoResponse(response) {
    if (response) {
      this.io.emit('GET_MEMO', {
        text: `${this.getPresidentUser().username} has approved ${
          this.getChancellorUser().username
        }'s veto request`,
        graphics: [this.getPresidentUser().id, this.getChancellorUser().id],
      });
      this.discardPile = this.discardPile.concat(this.getChancellorUser().cards);
      this.increaseFailedGovernments();
      if (!this.gameOver) {
        this.chooseNextChancellor();
      }
    } else {
      this.io.emit('GET_MEMO', {
        text: `${this.getPresidentUser().username} has denied ${
          this.getChancellorUser().username
        }'s veto request`,
        graphics: [this.getPresidentUser().id, this.getChancellorUser().id],
      });
      this.getPresidentUser().usedVeto = true;
    }
  }

  increaseFailedGovernments() {
    this.failedGovernmentCounter += 1;
    if (this.failedGovernmentCounter === 3) {
      this.failedGovernmentCounter = 0;
      this.io.emit('GET_MEMO', {
        text: `A ${this.drawPile[0]} policy was passed because of 3 failed governments`,
        graphics: [`${this.drawPile[0]}-policy`],
      });
      this.passTopPolicy();
      this.drawPileShuffle();
      Object.values(this.users).forEach((user) => {
        user.isTermLimited = false;
      });
    }
    this.io.emit('SYNC_FAILED_GOVERNMENTS', this.failedGovernmentCounter);
  }

  hasUserWithUsername(username) {
    return Object.values(this.users).findIndex(user => user.username === username) !== -1;
  }

  canCloseGame(id) {
    return this.users[id] && this.gameOver && this.users[id].host;
  }

  closeGame() {
    this.io.emit('SET_GAME_STATE', 'login');
    this.resetState();
    this.users = {};
  }

  disconnectUser(userId) {
    if (this.users[userId]) {
      this.users[userId].disconnected = true;
      this.io.emit('GET_MEMO', {
        text: `${
          this.users[userId].username
        } has disconnected. Game is paused until the player reconnects.`,
        graphics: [],
      });
    }
    if (Object.values(this.users).findIndex(user => !user.disconnected) === -1) {
      Object.keys(this.users).forEach((userKey) => {
        delete this.users[userKey];
      });
      this.gameOver = true;
    }
  }

  hasDisconnectedUsers() {
    return Object.values(this.users).findIndex(user => user.disconnected) !== -1;
  }

  isReconnectingUser(username) {
    return (
      !this.gameOver &&
      Object.values(this.users).findIndex(user => user.disconnected && user.username === username) !== -1
    );
  }

  reconnectUser(socket, username) {
    let user = Object.values(this.users).filter(userToFind => userToFind.username === username)[0];
    this.users[socket.id] = user;
    delete this.users[user.id];
    user = this.users[socket.id];
    user.id = socket.id;
    user.socket = socket;
    user.disconnected = false;
    this.io.emit('GET_MEMO', { text: `${username} has rejoined the game.`, graphics: [] });
    this.syncUsers();
    socket.emit('SET_GAME_STAGE', this.gameStage);
    socket.emit('SYNC_FAILED_GOVERNMENTS', this.failedGovernmentCounter);
    socket.emit('SYNC_SCORE', {
      liberal: this.liberalCardsPlayed,
      fascist: this.fascistCardsPlayed,
    });
    user.socket.emit('SYNC_USER', user.getSelfInfo());

    if (this.gameStage === 'fascistPower') {
      this.io.emit('FASCIST_POWER', this.getFascistPower());
      this.getPresidentUser().socket.emit('FASCIST_INFO', this.drawPile.slice(0, 3));
    }

    socket.emit('SET_GAME_STATE', 'game');
  }
}

export default GameManager;
