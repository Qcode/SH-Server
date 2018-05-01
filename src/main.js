import GameManager from './GameManager';

const app = require('express')();
const http = require('http').Server(app);
const io = require('socket.io')(http);

const game = new GameManager();

io.on('connection', (socket) => {
  game.addUser(socket);
  console.log('user connected', socket);
  socket.on('disconnect', (reason) => {
    console.log(reason);
  });
});

http.listen(8080, () => {
  console.log('listening on *:8080');
});
