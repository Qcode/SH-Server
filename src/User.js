class User {
  constructor(socket, username, isHost) {
    this.socket = socket;
    this.id = socket.id;
    this.username = username;
    this.host = isHost;
    this.isLiberal = true;
    this.isHitler = false;
    this.isChancellor = false;
    this.isPresident = false;
    this.voteCast = 'uncast';
    this.cards = [];
  }

  getInfo(userReceivingData) {
    const { socket, cards, ...fullInfo } = this;
    if (userReceivingData.id === this.id || !userReceivingData.isLiberal) {
      return fullInfo;
    }
    const { isLiberal, isHitler, ...minisculeInfo } = fullInfo;
    return minisculeInfo;
  }

  getSelfInfo() {
    const { socket, ...rest } = this;
    return rest;
  }
}

export default User;
