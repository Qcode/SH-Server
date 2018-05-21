class User {
  constructor(socket, username, isHost) {
    this.socket = socket;
    this.username = username;
    this.host = isHost;
    this.isLiberal = true;
    this.isHitler = false;
  }

  getInfo(userReceivingData) {
    const { socket, ...fullInfo } = this;
    if (userReceivingData.socket.id === this.socket.id || !userReceivingData.isLiberal) {
      return fullInfo;
    }
    const { isLiberal, isHitler, ...minisculeInfo } = fullInfo;
    return minisculeInfo;
  }
}

export default User;
