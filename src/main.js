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
  socket.on('disconnect', (reason) => {
    console.log(reason);
  });
});

http.listen(8080, () => {
  console.log('listening on *:8080');
});
