const EventEmitter = require('node:events');
const db = require('./db');
const { getMinRank, createDeck, shuffle, evaluateBest, compareScores, cardLabel, getSmartDiscards } = require('./turkPokerHand');

class TurkPokerTable extends EventEmitter {
  constructor(config = {}) {
    super();
    this.seatsCount = 4;
    this.buyIn = config.buyIn || 100;
    this.smallBlind = config.smallBlind || 5;
    this.bigBlind = config.bigBlind || 10;
    this.minPlayers = 2;
    this.rakePercent = config.rakePercent || 0.01;

    this.turnTimeoutMs = 20000;
    this.drawTimeoutMs = 25000;
    this.startDelayMs = 6000;
    this.betweenHandsDelayMs = 3000;
    this.nextHandDelayMs = 4500;

    this.seats = new Array(this.seatsCount).fill(null);
    this.dealerSeat = -1;
    this.sbSeat = null;
    this.bbSeat = null;
    this.deck = [];
    
    this.stage = 'waiting'; // 'waiting', 'betting1', 'draw', 'betting2', 'showdown'
    this.currentBet = 0;
    this.minRaise = this.bigBlind;
    this.turnSeat = null;
    this.toAct = new Set();
    this.turnTimer = null;
    this.turnDeadline = null;
    this.autoRunTimer = null;
    this.startTimer = null;
    this.pendingStartCountdown = false;
    this.nextHandAt = null;
    this.handNumber = 0;
    this.lastHandSummary = null;
    this.botCounter = 0;
  }

  // ---------- Bots ----------
  addBot(seatIndex = null) {
    let idx = seatIndex;
    if (idx === null || idx === undefined || !Number.isInteger(idx)) {
      idx = this.seats.findIndex((s) => s === null);
    }
    if (idx === -1 || idx < 0 || idx >= this.seatsCount) return { error: 'Bos koltuk yok.' };
    if (this.seats[idx]) return { error: 'Koltuk dolu.' };

    this.botCounter++;
    const name = 'Bot' + this.botCounter;
    this.seats[idx] = {
      userId: -this.botCounter, // Negative ID for bots
      name,
      stack: this.buyIn,
      cards: [],
      folded: this.stage !== 'waiting',
      allIn: false,
      bet: 0,
      totalContributed: 0,
      leavingAfterHand: false,
      isBot: true,
      hasDrawn: false,
    };
    this.log(`${name} (bot) masaya oturdu.`);
    this.emitUpdate();
    this.maybeScheduleStart();
    return { ok: true };
  }

  removeBots() {
    let removed = 0;
    if (this.stage !== 'waiting') return { error: 'El oynanirken bot cikarilamaz.' };
    for (let i = 0; i < this.seatsCount; i++) {
      if (this.seats[i] && this.seats[i].isBot) {
        this.seats[i] = null;
        removed++;
      }
    }
    if (removed) {
      this.log(`${removed} bot masadan cikarildi.`);
      this.emitUpdate();
    }
    return { ok: true };
  }

  // ---------- Helpers ----------
  findSeatByUser(userId) {
    return this.seats.findIndex((s) => s && s.userId === userId);
  }

  getPlayableSeatIndices() {
    const result = [];
    for (let i = 0; i < this.seatsCount; i++) {
      if (this.seats[i] && this.seats[i].stack > 0 && !this.seats[i].isSittingOut) result.push(i);
    }
    return result;
  }

  activeNonFoldedSeats() {
    const result = [];
    for (let i = 0; i < this.seatsCount; i++) {
      if (this.seats[i] && !this.seats[i].folded) result.push(i);
    }
    return result;
  }

  nextPlayableSeat(fromIdx) {
    for (let step = 1; step <= this.seatsCount; step++) {
      const next = (fromIdx + step + this.seatsCount) % this.seatsCount;
      const s = this.seats[next];
      if (s && s.stack > 0) return next;
    }
    return fromIdx;
  }

  log(message) {
    this.emit('log', message);
  }

  emitUpdate() {
    this.emit('update', this.getPublicState());
  }

  emitAnimation(type, seatIndex, amount = 0) {
    this.emit('animation', { type, seatIndex, amount });
  }

  emitPrivateCards() {
    const payload = [];
    for (const seat of this.seats) {
      if (seat && seat.cards.length && !seat.isBot) {
        payload.push({ userId: seat.userId, cards: seat.cards.map(cardLabel) });
      }
    }
    if (payload.length) this.emit('private-cards', payload);
  }

  // ---------- Disconnect & Reconnect ----------
  handleDisconnect(userId) {
    const idx = this.findSeatByUser(userId);
    if (idx !== -1) {
      this.seats[idx].isDisconnected = true;
      this.log(`${this.seats[idx].name} baglantisi koptu.`);
      this.emitUpdate();
    }
  }

  handleReconnect(userId) {
    const idx = this.findSeatByUser(userId);
    if (idx !== -1) {
      this.seats[idx].isDisconnected = false;
      this.seats[idx].isSittingOut = false;
      this.log(`${this.seats[idx].name} geri dondu.`);
      this.emitUpdate();
    }
  }

  // ---------- Sitting ----------
  async sit(user, seatIndex, clientIp = null) {
    if (this.findSeatByUser(user.id) !== -1) return { error: 'Zaten masadasiniz.' };
    if (!Number.isInteger(seatIndex) || seatIndex < 0 || seatIndex >= this.seatsCount) {
      return { error: 'Gecersiz koltuk.' };
    }
    if (this.seats[seatIndex]) return { error: 'Koltuk dolu.' };

    // Anti-Collusion: IP Check
    if (clientIp) {
      const sameIpSeat = this.seats.find(s => s && !s.isBot && s.ip === clientIp);
      if (sameIpSeat) {
        return { error: 'Ayni agdan (IP) birden fazla oyuncu ayni masaya oturamaz.' };
      }
    }

    const freshUser = await db.getUserById(user.id);
    if (!freshUser || freshUser.lt_balance < this.buyIn) {
      return { error: `Oturmak icin en az ${this.buyIn} LT gerekli.` };
    }

    await db.adjustLt(user.id, -this.buyIn);
    this.seats[seatIndex] = {
      userId: user.id,
      name: freshUser.rumuz,
      stack: this.buyIn,
      cards: [],
      folded: this.stage !== 'waiting',
      allIn: false,
      bet: 0,
      totalContributed: 0,
      leavingAfterHand: false,
      isBot: false,
      ip: clientIp,
      isDisconnected: false,
      isSittingOut: false,
      hasDrawn: false,
    };
    this.log(`${this.seats[seatIndex].name} masaya oturdu (${this.buyIn} LT).`);
    this.emitUpdate();
    this.maybeScheduleStart();
    return { ok: true };
  }

  async stand(userId) {
    const idx = this.findSeatByUser(userId);
    if (idx === -1) return { error: 'Masada degilsiniz.' };
    const seat = this.seats[idx];

    if (this.stage === 'waiting') {
      const cashout = seat.stack;
      seat.stack = 0;
      this.seats[idx] = null;
      this.log(`${seat.name} masadan kalkti${cashout > 0 ? ` (${cashout} LT)` : ''}.`);
      this.emitUpdate();
      if (!seat.isBot && cashout > 0) await db.adjustLt(userId, cashout);
      return { ok: true };
    }

    seat.leavingAfterHand = true;
    if (!seat.folded) {
      this.applyFold(idx);
      this.advanceAfterAction();
    }
    const cashout = seat.stack;
    if (cashout > 0) {
      seat.stack = 0;
      this.log(`${seat.name} masadan kalkiyor (${cashout} LT iade edildi).`);
    }
    this.emitUpdate();
    if (!seat.isBot && cashout > 0) await db.adjustLt(userId, cashout);
    return { ok: true };
  }

  // ---------- Hand lifecycle ----------
  maybeScheduleStart(immediate = false) {
    if (this.stage !== 'waiting' || this.pendingStartCountdown) return;
    const playable = this.getPlayableSeatIndices();
    if (playable.length < this.minPlayers) return;

    const delay = immediate ? this.betweenHandsDelayMs : this.startDelayMs;
    this.pendingStartCountdown = true;
    this.nextHandAt = Date.now() + delay;
    this.startTimer = setTimeout(() => {
      this.pendingStartCountdown = false;
      this.startHand();
    }, delay);
    this.emitUpdate();
  }

  startHand() {
    const playable = this.getPlayableSeatIndices();
    if (playable.length < this.minPlayers) {
      this.stage = 'waiting';
      this.nextHandAt = null;
      this.emitUpdate();
      return;
    }

    this.handNumber++;
    this.stage = 'betting1';
    this.deck = shuffle(createDeck(playable.length));
    this.minRank = getMinRank(playable.length);
    this.currentBet = 0;
    this.minRaise = this.bigBlind;
    this.lastHandSummary = null;
    this.nextHandAt = null;

    for (const seat of this.seats) {
      if (!seat) continue;
      seat.cards = [];
      seat.bet = 0;
      seat.totalContributed = 0;
      seat.allIn = false;
      seat.hasDrawn = false;
      seat.folded = seat.stack <= 0;
      seat.actionsTaken = 0;
      seat.raisesMade = 0;
    }

    this.dealerSeat = this.nextPlayableSeat(this.dealerSeat);
    const active = this.getPlayableSeatIndices();

    let sbSeat;
    let bbSeat;
    if (active.length === 2) {
      sbSeat = this.dealerSeat;
      bbSeat = this.nextPlayableSeat(this.dealerSeat);
    } else {
      sbSeat = this.nextPlayableSeat(this.dealerSeat);
      bbSeat = this.nextPlayableSeat(sbSeat);
    }
    this.sbSeat = sbSeat;
    this.bbSeat = bbSeat;

    this.postBlind(sbSeat, this.smallBlind);
    this.postBlind(bbSeat, this.bigBlind);
    this.currentBet = this.bigBlind;

    // Deal 5 cards
    for (let r = 0; r < 5; r++) {
      for (const idx of active) {
        this.seats[idx].cards.push(this.deck.pop());
      }
    }

    this.log(`El #${this.handNumber} basladi. Kor: ${this.smallBlind}/${this.bigBlind}.`);
    this.beginBettingRound(true);
    this.emitUpdate();
    this.emitPrivateCards();
  }

  postBlind(seatIdx, amount) {
    const seat = this.seats[seatIdx];
    const pay = Math.min(amount, seat.stack);
    this.commitChips(seatIdx, pay);
    if (seat.stack === 0) seat.allIn = true;
  }

  commitChips(seatIndex, amount) {
    const seat = this.seats[seatIndex];
    if (amount <= 0) return;
    seat.stack -= amount;
    seat.bet += amount;
    seat.totalContributed += amount;
    this.emitAnimation('chip-bet', seatIndex, amount);
  }

  beginBettingRound(isPreflop = false) {
    this.toAct = new Set(this.activeNonFoldedSeats().filter((i) => !this.seats[i].allIn));
    if (this.toAct.size === 0) {
      this.endBettingRound();
      return;
    }
    
    let from = isPreflop ? this.bbSeat : this.dealerSeat;
    for (let step = 1; step <= this.seatsCount; step++) {
      const next = (from + step) % this.seatsCount;
      if (this.toAct.has(next)) {
        this.turnSeat = next;
        break;
      }
    }
    this.startTurnTimer();
  }

  // ---------- Actions ----------
  handleAction(userId, action, amountOrCards) {
    const idx = this.findSeatByUser(userId);
    if (idx === -1) return { error: 'Masada degilsiniz.' };
    const seat = this.seats[idx];

    if (action === 'call' || action === 'raise' || action === 'check' || action === 'fold' || action === 'discard') {
      seat.actionsTaken = (seat.actionsTaken || 0) + 1;
      if (action === 'raise') {
        seat.raisesMade = (seat.raisesMade || 0) + 1;
      }
    }

    if (this.stage === 'draw') {
      if (action !== 'discard') return { error: 'Su an kart degistirme asamasindayiz.' };
      if (seat.hasDrawn) return { error: 'Zaten kart degistirdiniz.' };
      
      const cardsToDiscard = Array.isArray(amountOrCards) ? amountOrCards : [];
      if (cardsToDiscard.length > 4) return { error: 'En fazla 4 kart degistirebilirsiniz.' };
      
      // Sort descending to safely remove by index
      cardsToDiscard.sort((a, b) => b - a);
      for (const cIdx of cardsToDiscard) {
        if (cIdx >= 0 && cIdx < seat.cards.length) {
          seat.cards.splice(cIdx, 1);
        }
      }
      
      // Deal replacements
      while (seat.cards.length < 5 && this.deck.length > 0) {
        seat.cards.push(this.deck.pop());
      }
      
      seat.hasDrawn = true;
      this.log(`${seat.name} ${cardsToDiscard.length} kart degistirdi.`);
      this.emitPrivateCards();
      
      this.checkDrawPhaseComplete();
      return { ok: true };
    }

    if (this.turnSeat !== idx) return { error: 'Sira sizde degil.' };
    this.clearTurnTimer();
    let label = '';

    switch (action) {
      case 'fold': {
        this.applyFold(idx);
        label = 'fold etti';
        break;
      }
      case 'check': {
        if (seat.bet !== this.currentBet) return { error: 'Check yapamazsiniz, call etmeniz gerekiyor.' };
        this.markActed(idx);
        label = 'check yapti';
        break;
      }
      case 'call': {
        const toCall = this.currentBet - seat.bet;
        if (toCall <= 0) {
          this.markActed(idx);
          label = 'check yapti';
          break;
        }
        const pay = Math.min(toCall, seat.stack);
        this.commitChips(idx, pay);
        if (seat.stack === 0) seat.allIn = true;
        this.markActed(idx);
        label = seat.allIn ? `${pay} LT ile all-in call yapti` : 'call yapti';
        break;
      }
      case 'raise': {
        const raiseTo = Math.floor(Number(amountOrCards));
        if (!Number.isFinite(raiseTo) || raiseTo <= this.currentBet) {
          return { error: 'Gecersiz raise miktari.' };
        }
        const neededChips = raiseTo - seat.bet;
        if (neededChips >= seat.stack) {
          return { error: 'Bu miktar icin all-in yapin.' };
        }
        const raiseIncrement = raiseTo - this.currentBet;
        if (raiseIncrement < this.minRaise) {
          return { error: `Minimum raise artisi ${this.minRaise} LT olmali.` };
        }
        this.commitChips(idx, neededChips);
        this.minRaise = raiseIncrement;
        this.currentBet = raiseTo;
        this.reopenActionForOthers(idx);
        this.markActed(idx);
        label = `${raiseTo} LT'ye raise yapti`;
        break;
      }
      case 'allin': {
        const neededChips = seat.stack;
        if (neededChips <= 0) return { error: 'Cipiniz yok.' };
        const raiseTo = seat.bet + neededChips;
        this.commitChips(idx, neededChips);
        seat.allIn = true;
        if (raiseTo > this.currentBet) {
          const raiseIncrement = raiseTo - this.currentBet;
          if (raiseIncrement >= this.minRaise) this.minRaise = raiseIncrement;
          this.currentBet = raiseTo;
          this.reopenActionForOthers(idx);
        }
        this.markActed(idx);
        label = `${raiseTo} LT ile all-in yapti`;
        break;
      }
      default:
        return { error: 'Bilinmeyen aksiyon.' };
    }

    this.log(`${seat.name} ${label}.`);
    this.advanceAfterAction();
    return { ok: true };
  }

  markActed(idx) {
    this.toAct.delete(idx);
  }

  reopenActionForOthers(raiserIdx) {
    this.toAct.clear();
    for (let i = 0; i < this.seatsCount; i++) {
      if (i === raiserIdx) continue;
      const s = this.seats[i];
      if (s && !s.folded && !s.allIn) this.toAct.add(i);
    }
  }

  applyFold(idx) {
    const seat = this.seats[idx];
    if (!seat || seat.folded) return;
    if (this.turnSeat === idx) this.clearTurnTimer();
    seat.folded = true;
    this.toAct.delete(idx);
    const remaining = this.activeNonFoldedSeats();
    if (remaining.length === 1) {
      this.awardPotToSingleWinner(remaining[0]);
    }
  }

  advanceAfterAction() {
    if (this.stage === 'showdown' || this.stage === 'waiting') return;
    const remaining = this.activeNonFoldedSeats();
    if (remaining.length <= 1) return;
    if (this.toAct.size === 0) this.endBettingRound();
    else this.moveToNextTurn();
  }

  moveToNextTurn() {
    if (this.toAct.size === 0) {
      this.turnSeat = null;
      return;
    }
    const from = this.turnSeat === null ? this.dealerSeat : this.turnSeat;
    for (let step = 1; step <= this.seatsCount; step++) {
      const next = (from + step) % this.seatsCount;
      if (this.toAct.has(next)) {
        this.turnSeat = next;
        this.startTurnTimer();
        this.emitUpdate();
        return;
      }
    }
  }

  endBettingRound() {
    this.turnSeat = null;
    this.clearTurnTimer();
    for (const seat of this.seats) {
      if (seat) seat.bet = 0;
    }
    this.currentBet = 0;
    this.minRaise = this.bigBlind;

    if (this.stage === 'betting1') {
      this.startDrawPhase();
    } else if (this.stage === 'betting2') {
      this.showdown();
    }
  }

  startDrawPhase() {
    this.stage = 'draw';
    this.log(`Kart degistirme asamasi. (25 sn)`);
    this.turnDeadline = Date.now() + this.drawTimeoutMs;
    this.emitUpdate();
    
    // Smart draw for bots immediately
    for (const seat of this.seats) {
      if (seat && !seat.folded && seat.isBot) {
        setTimeout(() => {
          if (this.stage === 'draw' && !seat.hasDrawn) {
            const discards = getSmartDiscards(seat.cards, this.minRank);
            const indicesToDiscard = discards.map(c => seat.cards.indexOf(c));
            this.handleAction(seat.userId, 'discard', indicesToDiscard);
          }
        }, Math.random() * 2000 + 1000);
      }
    }

    this.turnTimer = setTimeout(() => {
      // Force anyone who hasn't drawn to discard 0
      for (let i = 0; i < this.seatsCount; i++) {
        const s = this.seats[i];
        if (s && !s.folded && !s.hasDrawn) {
          this.handleAction(s.userId, 'discard', []);
        }
      }
    }, this.drawTimeoutMs);
  }

  checkDrawPhaseComplete() {
    const allDrawn = this.activeNonFoldedSeats().every(i => this.seats[i].hasDrawn);
    if (allDrawn) {
      this.clearTurnTimer();
      this.stage = 'betting2';
      this.log(`Ikinci bahis turu basladi.`);
      this.beginBettingRound(false);
      this.emitUpdate();
    }
  }

  // ---------- Showdown & Rake ----------
  buildSidePots() {
    const contributors = [];
    for (let i = 0; i < this.seatsCount; i++) {
      const s = this.seats[i];
      if (s && s.totalContributed > 0) {
        contributors.push({ idx: i, amount: s.totalContributed, folded: s.folded });
      }
    }
    if (contributors.length === 0) return [];
    const levels = [...new Set(contributors.map((c) => c.amount))].sort((a, b) => a - b);
    const pots = [];
    let prevLevel = 0;
    for (const level of levels) {
      const layer = contributors.filter((c) => c.amount >= level);
      const layerAmount = (level - prevLevel) * layer.length;
      if (layerAmount > 0) {
        const eligible = layer.filter((c) => !c.folded).map((c) => c.idx);
        pots.push({ amount: layerAmount, eligible });
      }
      prevLevel = level;
    }
    return pots;
  }

  emitHandResult(winMap, evalsMap = new Map()) {
    const participants = [];
    for (let i = 0; i < this.seatsCount; i++) {
      const s = this.seats[i];
      if (s && s.totalContributed > 0) {
        const won = winMap.get(i) || 0;
        const ev = evalsMap.get(i);
        const handRank = ev ? ev.score[0] : 0;
        participants.push({
          userId: s.userId,
          name: s.name,
          played: s.totalContributed,
          won,
          netChange: won - s.totalContributed,
          stackAfter: s.stack,
          handRank,
          potSize: won, // For biggest_pot_won stat, potSize is effectively how much they raked in.
          actionsTaken: s.actionsTaken || 0,
          raisesMade: s.raisesMade || 0,
        });
      }
    }
    if (participants.length) this.emit('hand-result', { handNumber: this.handNumber, participants });
  }

  showdown() {
    this.stage = 'showdown';
    clearTimeout(this.autoRunTimer);
    const remaining = this.activeNonFoldedSeats();
    const pots = this.buildSidePots();
    const results = [];
    
    // minRank was calculated at start of hand
    const minRank = this.minRank;

    const evalsMap = new Map();
    for (const pot of pots) {
      const contenders = pot.eligible.filter((i) => remaining.includes(i));
      if (contenders.length === 0) continue;
      
      const evals = contenders.map((i) => {
        let ev = evalsMap.get(i);
        if (!ev) {
          ev = evaluateBest(this.seats[i].cards, minRank);
          evalsMap.set(i, ev);
        }
        return { idx: i, ev };
      });
      let topScore = evals[0].ev.score;
      for (const e of evals) {
        if (compareScores(e.ev.score, topScore) > 0) topScore = e.ev.score;
      }
      const winners = evals.filter((e) => compareScores(e.ev.score, topScore) === 0);
      
      // HOUSE RAKE DEDUCTION
      const rake = Math.floor(pot.amount * this.rakePercent);
      const afterRake = pot.amount - rake;
      this.log(`Pot: ${pot.amount} LT, Rake (Komisyon): ${rake} LT. (Dağıtılan: ${afterRake} LT)`);
      if (rake > 0) {
        db.addCommission('turkpoker', rake, this.handNumber).catch(err => console.error('Rake add error:', err));
      }
      
      const share = Math.floor(afterRake / winners.length);
      let remainder = afterRake - share * winners.length;
      
      for (const w of winners) {
        const amount = share + (remainder > 0 ? 1 : 0);
        if (remainder > 0) remainder--;
        this.seats[w.idx].stack += amount;
        results.push({ seatIdx: w.idx, name: this.seats[w.idx].name, amount, handName: w.ev.name });
      }
    }

    const summaryMap = new Map();
    let totalRake = 0;
    for (const pot of pots) {
      const rake = Math.floor(pot.amount * this.rakePercent);
      totalRake += rake;
    }
    for (const r of results) {
      if (!summaryMap.has(r.seatIdx)) {
        summaryMap.set(r.seatIdx, { name: r.name, amount: 0, handName: r.handName });
      }
      summaryMap.get(r.seatIdx).amount += r.amount;
    }
    const winners = [...summaryMap.values()];
    this.lastHandSummary = {
      winners,
      rake: totalRake,
      showdown: remaining.map((i) => ({
        name: this.seats[i].name,
        cards: this.seats[i].cards.map(cardLabel),
      })),
    };
    for (const w of winners) this.log(`${w.name} ${w.amount} LT kazandi (${w.handName}).`);

    const winMap = new Map();
    for (const [seatIdx, info] of summaryMap.entries()) winMap.set(seatIdx, info.amount);
    this.emitHandResult(winMap, evalsMap);

    this.finishHand();
  }

  awardPotToSingleWinner(idx) {
    this.clearTurnTimer();
    clearTimeout(this.autoRunTimer);
    this.turnSeat = null;
    const total = this.seats.reduce((sum, s) => sum + (s ? s.totalContributed : 0), 0);
    
    // Evaluate hand for stats tracking even if didn't reach showdown
    const evalsMap = new Map();
    if (this.seats[idx].cards.length === 5) {
      evalsMap.set(idx, evaluateBest(this.seats[idx].cards, this.minRank));
    }
    
    // HOUSE RAKE DEDUCTION
    const rake = Math.floor(total * this.rakePercent);
    const afterRake = total - rake;
    if (rake > 0) {
      db.addCommission('turkpoker', rake, this.handNumber).catch(err => console.error('Rake add error:', err));
    }
    
    this.seats[idx].stack += afterRake;
    this.lastHandSummary = {
      winners: [{ name: this.seats[idx].name, amount: afterRake, handName: 'Rakipler fold etti' }],
      showdown: [],
    };
    this.log(`${this.seats[idx].name} ${afterRake} LT kazandi (Komisyon: ${rake} LT).`);
    this.stage = 'showdown';

    const winMap = new Map([[idx, afterRake]]);
    this.emitHandResult(winMap, evalsMap);

    this.finishHand();
  }

  finishHand() {
    this.clearTurnTimer();
    clearTimeout(this.autoRunTimer);
    this.emitUpdate();
    this.startTimer = setTimeout(async () => {
      await this.cleanupAfterHand();
      this.stage = 'waiting';
      this.turnSeat = null;
      this.emitUpdate();
      this.maybeScheduleStart(true);
    }, this.nextHandDelayMs);
  }

  async cleanupAfterHand() {
    for (let i = 0; i < this.seatsCount; i++) {
      const s = this.seats[i];
      if (!s) continue;
      if (s.leavingAfterHand) {
        if (!s.isBot && s.stack > 0) await db.adjustLt(s.userId, s.stack);
        this.seats[i] = null;
        continue;
      }
      if (s.stack <= 0) {
        this.log(`${s.name} LT'si bitti ve masadan kalkti.`);
        this.seats[i] = null;
      }
    }
  }

  // ---------- Timers ----------
  startTurnTimer() {
    this.clearTurnTimer();
    this.turnDeadline = Date.now() + this.turnTimeoutMs;
    this.turnTimer = setTimeout(() => this.handleTimeout(), this.turnTimeoutMs);
    
    // Bot logic
    const s = this.seats[this.turnSeat];
    if (s && s.isBot) {
      setTimeout(() => {
        if (this.turnSeat !== null && this.seats[this.turnSeat]?.userId === s.userId) {
          const toCall = this.currentBet - s.bet;
          const score = evaluateBest(s.cards, this.minRank).handRank;
          
          let isAggressive = Math.random() < 0.10; // 10% bluff chance
          
          if (this.stage === 'betting1') {
             if (score >= 2 || (score === 1 && s.cards.some(c => c.rank > 11))) isAggressive = true;
             else if (score === 1) isAggressive = Math.random() < 0.5;
          } else if (this.stage === 'betting2') {
             if (score >= 3) isAggressive = true;
             else if (score >= 2) isAggressive = Math.random() < 0.5;
          }
          
          if (isAggressive) {
             if (toCall === 0) {
                if (Math.random() < 0.5 && s.stack > this.bigBlind) this.handleAction(s.userId, 'raise', this.currentBet + this.minRaise);
                else this.handleAction(s.userId, 'check');
             } else {
                if (Math.random() < 0.3 && s.stack > toCall + this.minRaise) this.handleAction(s.userId, 'raise', this.currentBet + this.minRaise);
                else this.handleAction(s.userId, 'call');
             }
          } else {
             if (toCall === 0) {
               this.handleAction(s.userId, 'check');
             } else {
               if (score === 0 && this.stage === 'betting2') {
                 this.handleAction(s.userId, 'fold');
               } else if (toCall < s.stack * 0.1 && score >= 1) {
                 this.handleAction(s.userId, 'call');
               } else {
                 this.handleAction(s.userId, 'fold');
               }
             }
          }
        }
      }, Math.random() * 2000 + 1000);
    }
  }

  clearTurnTimer() {
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }
    this.turnDeadline = null;
  }

  handleTimeout() {
    const idx = this.turnSeat;
    if (idx === null) return;
    const seat = this.seats[idx];
    if (!seat) return;
    
    if (seat.bet === this.currentBet) {
      this.markActed(idx);
      this.log(`${seat.name} suresi doldu, check gecti.`);
    } else {
      this.applyFold(idx);
      this.log(`${seat.name} suresi doldu, fold etti.`);
    }
    
    // Disconnect handling: if they timed out while disconnected, set them to sitting out
    if (seat.isDisconnected) {
      seat.isSittingOut = true;
    }
    
    this.advanceAfterAction();
  }

  // ---------- State ----------
  getPublicState() {
    return {
      stage: this.stage,
      pot: this.seats.reduce((sum, s) => sum + (s ? s.totalContributed : 0), 0),
      dealerSeat: this.dealerSeat,
      turnSeat: this.turnSeat,
      turnDeadline: this.turnDeadline,
      currentBet: this.currentBet,
      minRaise: this.minRaise,
      handNumber: this.handNumber,
      nextHandAt: this.nextHandAt,
      rakePercent: this.rakePercent,
      buyIn: this.buyIn,
      gameMode: this.gameMode || 'Tekli',
      gameType: this.gameType || 'Standart',
      seatCount: this.seatsCount,
      lastHandSummary: this.lastHandSummary,
      seats: this.seats.map((s, i) =>
        s
          ? {
              seatIndex: i,
              userId: s.userId,
              name: s.name,
              stack: s.stack,
              bet: s.bet,
              folded: s.folded,
              allIn: s.allIn,
              hasDrawn: s.hasDrawn,
              leavingAfterHand: s.leavingAfterHand,
              isBot: s.isBot,
              isDisconnected: s.isDisconnected,
              isSittingOut: s.isSittingOut,
              cardCount: s.cards.length,
              revealed: this.stage === 'showdown' && !s.folded ? s.cards.map(cardLabel) : null,
              isTurn: this.turnSeat === i,
              isDealer: this.dealerSeat === i,
            }
          : null
      ),
    };
  }
}

module.exports = { TurkPokerTable };
