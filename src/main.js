import GameManager from './GameManager';

const app = require('express')();
const http = require('http').Server(app);
const io = require('socket.io')(http);

const game = new GameManager(io);

io.on('connection', (socket) => {
  socket.on('JOIN_GAME', (data, callback) => {
    game.addUser(socket, data.username);
    callback(); // This acknowledges the server received the join request
  });
  socket.on('START_GAME', () => {
    if (game.canStartGame(socket.id)) {
      game.startGame();
    } else {
      console.log('Invalid permissions to start game');
    }
  });
  socket.on('SUBMIT_CHANCELLOR', (chancellorId) => {
    if (game.isValidChancellor(chancellorId, socket.id)) {
      game.nominateChancellor(chancellorId);
    } else {
      console.log('Invalid chancellor submission');
    }
  });
  socket.on('VOTE_FOR_CHANCELLOR', (vote) => {
    if (GameManager.isValidVote(vote)) {
      game.logChancellorVote(socket.id, vote);
    }
  });
  socket.on('DISCARD_CARD', (card) => {
    if (game.isValidDiscard(card, socket.id)) {
      game.discardCard(card, socket.id);
    }
  });
  socket.on('ENACT_FASCIST_POWER', (info) => {
    if (game.canEnactFascistPower(socket.id)) {
      game.enactFascistPower(info);
    }
  });
  socket.on('disconnect', (reason) => {
    console.log(reason);
  });
});

http.listen(8080, () => {
  console.log('listening on *:8080');
});
