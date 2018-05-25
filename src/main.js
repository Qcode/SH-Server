import GameManager from './GameManager';

const app = require('express')();
const http = require('http').Server(app);
const io = require('socket.io')(http);

const game = new GameManager(io);

io.on('connection', (socket) => {
  socket.on('join', (data, callback) => {
    game.addUser(socket, data.username);
    callback(); // This acknowledges the server received the join request
  });
  socket.on('startGame', () => {
    if (game.canStartGame(socket.id)) {
      game.startGame();
    } else {
      console.log('Invalid permissions to start game');
    }
  });
  socket.on('submitChancellor', (chancellorId) => {
    if (game.isValidChancellor(chancellorId, socket.id)) {
      game.nominateChancellor(chancellorId);
    } else {
      console.log('Invalid chancellor submission');
    }
  });
  socket.on('chancellorVote', (vote) => {
    if (GameManager.isValidVote(vote)) {
      game.logChancellorVote(socket.id, vote);
    }
  });
  socket.on('discardCard', (card) => {
    if (game.isValidDiscard(card, socket.id)) {
      game.discardCard(card, socket.id);
    }
  });
  socket.on('disconnect', (reason) => {
    console.log(reason);
  });
});

http.listen(8080, () => {
  console.log('listening on *:8080');
});
