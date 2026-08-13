const EventEmitter = require('node:events');
const db = require('./db');
const { createDeck, shuffle, evaluateBest, compareScores, cardLabel } = require('./pokerHand');

const BUY_IN = 100;
const SMALL_BLIND = 5;
const BIG_BLIND = 10;
const MIN_PLAYERS = 2;
const TURN_TIMEOUT_MS = 20000;
const START_DELAY_MS = 6000;
const BETWEEN_HANDS_DELAY_MS = 3000;
const NEXT_HAND_DELAY_MS = 4500;

class PokerTable extends EventEmitter {
  constructor(config) {
    super();
    this.seatsCount = (config && config.seatsCount) || 4;
    this.seats = new Array(this.seatsCount).fill(null);
    this.dealerSeat = -1;
    this.sbSeat = null;
    this.bbSeat = null;
    this.deck = [];
    this.community = [];
    this.stage = 'waiting';
    this.currentBet = 0;
    this.minRaise = BIG_BLIND;
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
  }

  // ---------- Helpers ----------
  findSeatByUser(userId) {
    return this.seats.findIndex((s) => s && s.userId === userId);
  }

  getPlayableSeatIndices() {
    const result = [];
    for (let i = 0; i < this.seatsCount; i++) {
      if (this.seats[i] && this.seats[i].stack > 0) result.push(i);
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

  emitPrivateCards() {
    const payload = [];
    for (const seat of this.seats) {
      if (seat && seat.cards.length) {
        payload.push({ userId: seat.userId, cards: seat.cards.map(cardLabel) });
      }
    }
    if (payload.length) this.emit('private-cards', payload);
  }

  // ---------- Sitting ----------
  async sit(user, seatIndex) {
    if (this.findSeatByUser(user.id) !== -1) return { error: 'Zaten masadasiniz.' };
    if (!Number.isInteger(seatIndex) || seatIndex < 0 || seatIndex >= this.seatsCount) {
      return { error: 'Gecersiz koltuk.' };
    }
    if (this.seats[seatIndex]) return { error: 'Koltuk dolu.' };

    const freshUser = await db.getUserById(user.id);
    if (!freshUser || freshUser.lt_balance < BUY_IN) {
      return { error: `Oturmak icin en az ${BUY_IN} LT gerekli.` };
    }
    if (this.seats[seatIndex]) return { error: 'Koltuk dolu.' };

    await db.adjustLt(user.id, -BUY_IN);
    this.seats[seatIndex] = {
      userId: user.id,
      name: freshUser.rumuz,
      stack: BUY_IN,
      cards: [],
      folded: this.stage !== 'waiting',
      allIn: false,
      bet: 0,
      totalContributed: 0,
      leavingAfterHand: false,
    };
    this.log(`${this.seats[seatIndex].name} masaya oturdu (${BUY_IN} LT).`);
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
      if (cashout > 0) await db.adjustLt(userId, cashout);
      return { ok: true };
    }

    seat.leavingAfterHand = true;
    if (!seat.folded) {
      this.applyFold(idx);
      this.advanceAfterAction();
    }
    // fold sonrasi kalan cipler artik elde risk altinda degil, hemen iade et
    const cashout = seat.stack;
    if (cashout > 0) {
      seat.stack = 0;
      this.log(`${seat.name} masadan kalkiyor (${cashout} LT iade edildi).`);
    }
    this.emitUpdate();
    if (cashout > 0) await db.adjustLt(userId, cashout);
    return { ok: true };
  }

  // ---------- Hand lifecycle ----------
  maybeScheduleStart(immediate = false) {
    if (this.stage !== 'waiting' || this.pendingStartCountdown) return;
    const playable = this.getPlayableSeatIndices();
    if (playable.length < MIN_PLAYERS) return;

    const delay = immediate ? BETWEEN_HANDS_DELAY_MS : START_DELAY_MS;
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
    if (playable.length < MIN_PLAYERS) {
      this.stage = 'waiting';
      this.nextHandAt = null;
      this.emitUpdate();
      return;
    }

    this.handNumber++;
    this.stage = 'preflop';
    this.community = [];
    this.deck = shuffle(createDeck());
    this.currentBet = 0;
    this.minRaise = BIG_BLIND;
    this.lastHandSummary = null;
    this.nextHandAt = null;

    for (const seat of this.seats) {
      if (!seat) continue;
      seat.cards = [];
      seat.bet = 0;
      seat.totalContributed = 0;
      seat.allIn = false;
      seat.folded = seat.stack <= 0;
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

    this.postBlind(sbSeat, SMALL_BLIND);
    this.postBlind(bbSeat, BIG_BLIND);
    this.currentBet = BIG_BLIND;

    for (let r = 0; r < 2; r++) {
      for (const idx of active) {
        this.seats[idx].cards.push(this.deck.pop());
      }
    }

    this.log(`El #${this.handNumber} basladi. Kor: ${SMALL_BLIND}/${BIG_BLIND}.`);
    this.beginPreflopBetting();
    this.emitUpdate();
    this.emitPrivateCards();
  }

  postBlind(seatIdx, amount) {
    const seat = this.seats[seatIdx];
    const pay = Math.min(amount, seat.stack);
    this.commitChips(seatIdx, pay);
    if (seat.stack === 0) seat.allIn = true;
  }

  commitChips(idx, amount) {
    const seat = this.seats[idx];
    seat.stack -= amount;
    seat.bet += amount;
    seat.totalContributed += amount;
  }

  beginPreflopBetting() {
    this.toAct = new Set(this.activeNonFoldedSeats().filter((i) => !this.seats[i].allIn));
    if (this.toAct.size === 0) {
      this.endBettingRound();
      return;
    }
    for (let step = 1; step <= this.seatsCount; step++) {
      const next = (this.bbSeat + step) % this.seatsCount;
      if (this.toAct.has(next)) {
        this.turnSeat = next;
        break;
      }
    }
    this.startTurnTimer();
  }

  beginBettingRound() {
    this.toAct = new Set(this.activeNonFoldedSeats().filter((i) => !this.seats[i].allIn));
    if (this.toAct.size === 0) return;
    for (let step = 1; step <= this.seatsCount; step++) {
      const next = (this.dealerSeat + step) % this.seatsCount;
      if (this.toAct.has(next)) {
        this.turnSeat = next;
        break;
      }
    }
    this.startTurnTimer();
  }

  // ---------- Actions ----------
  handleAction(userId, action, amount) {
    const idx = this.findSeatByUser(userId);
    if (idx === -1) return { error: 'Masada degilsiniz.' };
    if (this.turnSeat !== idx) return { error: 'Sira sizde degil.' };
    const seat = this.seats[idx];
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
        const raiseTo = Math.floor(Number(amount));
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
    this.minRaise = BIG_BLIND;

    if (this.stage === 'preflop') this.dealFlop();
    else if (this.stage === 'flop') this.dealTurn();
    else if (this.stage === 'turn') this.dealRiver();
    else if (this.stage === 'river') {
      this.showdown();
      return;
    }

    const remaining = this.activeNonFoldedSeats();
    const canAct = remaining.filter((i) => !this.seats[i].allIn);
    this.emitUpdate();
    if (canAct.length <= 1) {
      this.autoRunTimer = setTimeout(() => this.endBettingRound(), 1300);
    } else {
      this.beginBettingRound();
    }
  }

  dealFlop() {
    this.deck.pop();
    this.community.push(this.deck.pop(), this.deck.pop(), this.deck.pop());
    this.stage = 'flop';
    this.log(`Flop acildi: ${this.community.map(cardLabel).join(' ')}`);
  }

  dealTurn() {
    this.deck.pop();
    this.community.push(this.deck.pop());
    this.stage = 'turn';
    this.log(`Turn acildi: ${cardLabel(this.community[3])}`);
  }

  dealRiver() {
    this.deck.pop();
    this.community.push(this.deck.pop());
    this.stage = 'river';
    this.log(`River acildi: ${cardLabel(this.community[4])}`);
  }

  // ---------- Showdown ----------
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

  // Bu el icin katilan tum koltuklarin oynadigi/kazandigi miktari
  // 'hand-result' event'i ile disari verir; server.js bunu game_logs tablosuna yazar.
  emitHandResult(winMap) {
    const participants = [];
    for (let i = 0; i < this.seatsCount; i++) {
      const s = this.seats[i];
      if (s && s.totalContributed > 0) {
        const won = winMap.get(i) || 0;
        participants.push({
          userId: s.userId,
          name: s.name,
          played: s.totalContributed,
          won,
          netChange: won - s.totalContributed,
          stackAfter: s.stack,
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

    for (const pot of pots) {
      const contenders = pot.eligible.filter((i) => remaining.includes(i));
      if (contenders.length === 0) continue;
      const evals = contenders.map((i) => ({
        idx: i,
        ev: evaluateBest([...this.seats[i].cards, ...this.community]),
      }));
      let topScore = evals[0].ev.score;
      for (const e of evals) {
        if (compareScores(e.ev.score, topScore) > 0) topScore = e.ev.score;
      }
      const winners = evals.filter((e) => compareScores(e.ev.score, topScore) === 0);
      const share = Math.floor(pot.amount / winners.length);
      let remainder = pot.amount - share * winners.length;
      for (const w of winners) {
        const amount = share + (remainder > 0 ? 1 : 0);
        if (remainder > 0) remainder--;
        this.seats[w.idx].stack += amount;
        results.push({ seatIdx: w.idx, name: this.seats[w.idx].name, amount, handName: w.ev.name });
      }
    }

    const summaryMap = new Map();
    for (const r of results) {
      if (!summaryMap.has(r.seatIdx)) {
        summaryMap.set(r.seatIdx, { name: r.name, amount: 0, handName: r.handName });
      }
      summaryMap.get(r.seatIdx).amount += r.amount;
    }
    const winners = [...summaryMap.values()];
    this.lastHandSummary = {
      winners,
      showdown: remaining.map((i) => ({
        name: this.seats[i].name,
        cards: this.seats[i].cards.map(cardLabel),
      })),
    };
    for (const w of winners) this.log(`${w.name} ${w.amount} LT kazandi (${w.handName}).`);

    const winMap = new Map();
    for (const [seatIdx, info] of summaryMap.entries()) winMap.set(seatIdx, info.amount);
    this.emitHandResult(winMap);

    this.finishHand();
  }

  awardPotToSingleWinner(idx) {
    this.clearTurnTimer();
    clearTimeout(this.autoRunTimer);
    this.turnSeat = null;
    const total = this.seats.reduce((sum, s) => sum + (s ? s.totalContributed : 0), 0);
    this.seats[idx].stack += total;
    this.lastHandSummary = {
      winners: [{ name: this.seats[idx].name, amount: total, handName: 'Rakipler fold etti' }],
      showdown: [],
    };
    this.log(`${this.seats[idx].name} ${total} LT kazandi (rakipler fold etti).`);
    this.stage = 'showdown';

    const winMap = new Map([[idx, total]]);
    this.emitHandResult(winMap);

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
    }, NEXT_HAND_DELAY_MS);
  }

  async cleanupAfterHand() {
    for (let i = 0; i < this.seatsCount; i++) {
      const s = this.seats[i];
      if (!s) continue;
      if (s.leavingAfterHand) {
        // stand() ciplerini zaten aninda iade etmisti; bu sadece bir guvenlik agi
        if (s.stack > 0) await db.adjustLt(s.userId, s.stack);
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
    this.turnDeadline = Date.now() + TURN_TIMEOUT_MS;
    this.turnTimer = setTimeout(() => this.handleTimeout(), TURN_TIMEOUT_MS);
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
    this.advanceAfterAction();
  }

  // ---------- State ----------
  getPublicState() {
    return {
      stage: this.stage,
      community: this.community.map(cardLabel),
      pot: this.seats.reduce((sum, s) => sum + (s ? s.totalContributed : 0), 0),
      dealerSeat: this.dealerSeat,
      turnSeat: this.turnSeat,
      turnDeadline: this.turnDeadline,
      currentBet: this.currentBet,
      minRaise: this.minRaise,
      handNumber: this.handNumber,
      nextHandAt: this.nextHandAt,
      buyIn: BUY_IN,
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
              leavingAfterHand: s.leavingAfterHand,
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

module.exports = { PokerTable, BUY_IN, SMALL_BLIND, BIG_BLIND };
