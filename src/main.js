import GameManager from './GameManager';

const app = require('express')();
const http = require('http').Server(app);
const io = require('socket.io')(http);

const game = new GameManager(io);

io.on('connection', (socket) => {
  socket.on('JOIN_GAME', (data, callback) => {
    if (!game.gameOver) {
      if (game.isReconnectingUser(data.username)) {
        game.reconnectUser(socket, data.username);
      } else {
        callback('Game already in progress');
      }
    } else if (game.getUserCount === 10) {
      callback('Lobby is full');
    } else if (game.username === '') {
      callback('No username');
    } else if (game.hasUserWithUsername(data.username)) {
      callback('A player already has this username');
    } else {
      game.addUser(socket, data.username);
      callback(true); // True signifies success
    }
  });
  socket.on('START_GAME', () => {
    if (game.canStartGame(socket.id)) {
      game.startGame();
    }
  });
  socket.on('SUBMIT_CHANCELLOR', (chancellorId) => {
    if (game.isValidChancellor(chancellorId, socket.id)) {
      game.nominateChancellor(chancellorId);
    }
  });
  socket.on('VOTE_FOR_CHANCELLOR', (vote) => {
    if (game.isValidVote(socket.id, vote)) {
      game.logChancellorVote(socket.id, vote);
    }
  });
  socket.on('DISCARD_CARD', (card) => {
    if (game.isValidDiscard(card, socket.id)) {
      game.discardCard(card, socket.id);
    }
  });
  socket.on('ENACT_FASCIST_POWER', (info) => {
    if (game.canEnactFascistPower(socket.id, info)) {
      game.enactFascistPower(info);
    }
  });
  socket.on('SUBMIT_VETO_REQUEST', () => {
    if (game.canSubmitVetoRequest(socket.id)) {
      game.sendVetoRequest();
    }
  });
  socket.on('RESPOND_VETO_REQUEST', (response) => {
    if (game.canRespondVetoRequest(socket.id)) {
      game.handleVetoResponse(response);
    }
  });
  socket.on('CLOSE_GAME', () => {
    if (game.canCloseGame(socket.id)) {
      game.closeGame();
    }
  });
  socket.on('disconnect', () => {
    game.disconnectUser(socket.id);
  });
});

http.listen(8080, () => {
  console.log('listening on *:8080');
});
