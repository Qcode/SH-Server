import GameManager from './GameManager';

const app = require('express')();
const http = require('http').Server(app);
const io = require('socket.io')(http);

const game = new GameManager();

io.on('connection', (socket) => {
  socket.on('join', data => game.addUser(socket, data.username));
  socket.on('disconnect', (reason) => {
    console.log(reason);
  });
});

http.listen(8080, () => {
  console.log('listening on *:8080');
});
