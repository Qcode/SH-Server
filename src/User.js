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
    this.isDead = false;
    this.isTermLimited = false;
    this.usedVeto = false;
  }

  getInfo(deservesFullInfo) {
    const { socket, cards, ...fullInfo } = this;
    if (deservesFullInfo) {
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
