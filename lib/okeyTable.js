const EventEmitter = require('node:events');
const db = require('./db');
const okey = require('./okeyLogic');

const SEATS = 4;
const MIN_PLAYERS = 2; // en az 2 gercek/bot oyuncu ile baslar (test icin bot eklenebilir)
const BASE_STAKE = 20;
const BOT_NAMES = ['BotAli', 'BotVeli', 'BotCan', 'BotEce'];
const BOT_ACTION_DELAY_MS = 1500;
const MIN_BALANCE_TO_SIT = 200; // en kotu senaryo: 20 * 2(elden) * 2(cift) * 2(gosterge sahibi) = 160
const TURN_TIMEOUT_MS = 25000;
const START_DELAY_MS = 6000;
const BETWEEN_HANDS_DELAY_MS = 3000;
const NEXT_HAND_DELAY_MS = 5000;

class OkeyTable extends EventEmitter {
  constructor() {
    super();
    this.seats = new Array(SEATS).fill(null);
    this.botCounter = 0;
    this.botTimer = null;
    this.dealerSeat = -1;
    this.deck = [];
    this.indicator = null;
    this.okeySpec = null;
    this.stage = 'waiting'; // waiting | playing | finished
    this.turnSeat = null;
    this.hasDrawn = false;
    this.drawSource = null; // 'deck' | 'discard'
    this.lastDiscard = null; // { tile, fromSeat, availableToSeat }
    this.discardPiles = [[], [], [], []]; // her koltugun attigi taslar (koseye dizilir)
    this.turnTimer = null;
    this.turnDeadline = null;
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

  isBotSeat(idx) {
    return !!(this.seats[idx] && this.seats[idx].isBot);
  }

  firstEmptySeat() {
    return this.seats.findIndex((s) => !s);
  }

  humanSeatedCount() {
    return this.seats.filter((s) => s && !s.isBot).length;
  }

  seatedCount() {
    return this.seats.filter(Boolean).length;
  }

  // Bir koltuktan SONRAKI (sirasi gelecek) dolu koltugu bulur.
  // Sira SAGA doner: 0=alt, 1=sag, 2=ust, 3=sol -> 0 -> 1 -> 2 -> 3 -> 0
  nextOccupiedSeat(fromIdx) {
    for (let step = 1; step <= SEATS; step++) {
      const next = (fromIdx + step) % SEATS;
      if (this.seats[next]) return next;
    }
    return fromIdx;
  }

  // ---- Bot yonetimi (test icin) ----
  addBot(seatIndex = null) {
    let idx = seatIndex;
    if (idx === null || idx === undefined || !Number.isInteger(idx)) idx = this.firstEmptySeat();
    if (idx === -1 || idx < 0 || idx >= SEATS) return { error: 'Bos koltuk yok.' };
    if (this.seats[idx]) return { error: 'Koltuk dolu.' };

    this.botCounter++;
    const name = BOT_NAMES[(this.botCounter - 1) % BOT_NAMES.length] + (this.botCounter > BOT_NAMES.length ? this.botCounter : '');
    this.seats[idx] = {
      userId: -this.botCounter, // negatif id = bot (gercek kullanicilarla cakismaz)
      name,
      tiles: [],
      leavingAfterHand: false,
      isBot: true,
    };
    this.log(`${name} (bot) masaya oturdu.`);
    this.emitUpdate();
    this.maybeScheduleStart();
    return { ok: true };
  }

  removeBots() {
    let removed = 0;
    if (this.stage === 'playing') return { error: 'El oynanirken bot cikarilamaz.' };
    for (let i = 0; i < SEATS; i++) {
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

  scheduleBotTurn() {
    clearTimeout(this.botTimer);
    if (this.stage !== 'playing' || this.turnSeat === null) return;
    if (!this.isBotSeat(this.turnSeat)) return;
    this.botTimer = setTimeout(() => this.runBotTurn(), BOT_ACTION_DELAY_MS);
  }

  runBotTurn() {
    const idx = this.turnSeat;
    if (this.stage !== 'playing' || idx === null || !this.isBotSeat(idx)) return;
    const seat = this.seats[idx];
    if (!seat) return;
    const botId = seat.userId;

    // 1) Cekmediyse: cogunlukla desteden cek (bazen iskartadan)
    if (!this.hasDrawn) {
      let source = 'deck';
      if (this.lastDiscard && this.lastDiscard.availableToSeat === idx && Math.random() < 0.3) {
        source = 'discard';
      }
      if (source === 'deck' && this.deck.length === 0) {
        this.voidHand('Deste tukendi.');
        return;
      }
      this.handleDraw(botId, source);
      // Cektikten sonra atma icin tekrar planla
      this.scheduleBotTurn();
      return;
    }

    // 2) Cektiyse: once bitirebilir mi bak
    const outcome = this.findFinishingSplit(seat.tiles);
    if (outcome) {
      this.clearTurnTimer();
      this.settleHand(idx, outcome.ciftBitti).catch((err) => console.error('Bot bitis hatasi:', err));
      return;
    }

    // 3) Bitiremiyorsa: okey/joker olmayan rastgele bir tas at
    const discardable = seat.tiles.filter(
      (t) => !t.joker && !(t.color === this.okeySpec.color && t.number === this.okeySpec.number)
    );
    const pool = discardable.length ? discardable : seat.tiles;
    const tile = pool[Math.floor(Math.random() * pool.length)];
    this.handleDiscard(botId, tile.id);
  }

  log(message) {
    this.emit('log', message);
  }

  emitUpdate() {
    this.emit('update', this.getPublicState());
  }

  emitPrivateTiles() {
    const payload = [];
    for (const seat of this.seats) {
      if (seat) payload.push({ userId: seat.userId, tiles: seat.tiles });
    }
    if (payload.length) this.emit('private-tiles', payload);
  }

  // ---------- Sitting ----------
  async sit(user, seatIndex) {
    if (this.findSeatByUser(user.id) !== -1) return { ok: true, alreadySeated: true };
    if (this.stage !== 'waiting') return { error: 'Oyun basladi, sonraki eli beklemelisiniz.' };
    if (!Number.isInteger(seatIndex) || seatIndex < 0 || seatIndex >= SEATS) {
      return { error: 'Gecersiz koltuk.' };
    }
    if (this.seats[seatIndex]) return { error: 'Koltuk dolu.' };

    const freshUser = await db.getUserById(user.id);
    if (!freshUser) {
      return { error: 'Kullanici bulunamadi.' };
    }
    // Bakiye kontrolu: yeterli LT olmayan oyuncu oturamaz
    if (freshUser.lt_balance < MIN_BALANCE_TO_SIT) return { error: `Oturmak icin en az ${MIN_BALANCE_TO_SIT} LT bakiye gerekli.` };
    if (this.seats[seatIndex]) return { error: 'Koltuk dolu.' };

    this.seats[seatIndex] = {
      userId: user.id,
      name: freshUser.rumuz,
      tiles: [],
      leavingAfterHand: false,
    };
    this.log(`${this.seats[seatIndex].name} masaya oturdu.`);
    this.emitUpdate();
    this.maybeScheduleStart();
    return { ok: true };
  }

  checkAutoCleanup() {
    const humanPlayers = this.seats.filter((s) => s && !s.isBot);
    if (humanPlayers.length === 0) {
      this.resetTable();
    }
  }

  resetTable() {
    clearTimeout(this.turnTimer);
    clearTimeout(this.startTimer);
    clearTimeout(this.botTimer);
    this.turnTimer = null;
    this.startTimer = null;
    this.botTimer = null;
    this.seats = new Array(SEATS).fill(null);
    this.botCounter = 0;
    this.stage = 'waiting';
    this.turnSeat = null;
    this.hasDrawn = false;
    this.lastDiscard = null;
    this.discardPiles = [[], [], [], []];
    this.pendingStartCountdown = false;
    this.nextHandAt = null;
    this.handNumber = 0;
    this.lastHandSummary = null;
    this.emitUpdate();
  }

  stand(userId) {
    const idx = this.findSeatByUser(userId);
    if (idx === -1) return { error: 'Masada degilsiniz.' };
    const seat = this.seats[idx];

    if (this.stage === 'waiting') {
      this.seats[idx] = null;
      this.log(`${seat.name} masadan kalkti.`);
      this.checkAutoCleanup();
      this.emitUpdate();
      return { ok: true };
    }

    seat.leavingAfterHand = true;
    this.log(`${seat.name} el bitince masadan kalkacak.`);
    this.checkAutoCleanup();
    this.emitUpdate();
    return { ok: true };
  }

  // ---------- Hand lifecycle ----------
  maybeScheduleStart(immediate = false) {
    if (this.stage !== 'waiting' || this.pendingStartCountdown) return;
    if (this.seatedCount() < MIN_PLAYERS) return;

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
    if (this.seatedCount() < MIN_PLAYERS) {
      this.stage = 'waiting';
      this.nextHandAt = null;
      this.emitUpdate();
      return;
    }

    this.handNumber++;
    this.stage = 'playing';
    this.lastHandSummary = null;
    this.nextHandAt = null;
    this.lastDiscard = null;
    this.discardPiles = [[], [], [], []];
    this.hasDrawn = false;
    this.drawSource = null;

    const shuffled = okey.shuffle(okey.createTileSet());
    const { indicator, deck } = okey.extractIndicator(shuffled);
    this.indicator = indicator;
    this.okeySpec = okey.realOkeySpecFor(indicator);

    this.dealerSeat = this.nextOccupiedSeat(this.dealerSeat);
    const starterSeat = this.nextOccupiedSeat(this.dealerSeat);

    for (const seat of this.seats) {
      if (seat) seat.tiles = [];
    }
    for (let round = 0; round < 14; round++) {
      for (let s = 0; s < SEATS; s++) {
        if (this.seats[s]) this.seats[s].tiles.push(deck.pop());
      }
    }
    this.seats[starterSeat].tiles.push(deck.pop());
    this.deck = deck;

    this.turnSeat = starterSeat;
    this.hasDrawn = true; // baslayan oyuncu zaten 15 tasla basliyor
    this.drawSource = 'deck'; // baslangic tasi da desteden gelmis sayilir

    this.log(
      `El #${this.handNumber} basladi. Gosterge: ${this.tileLabel(this.indicator)}, okey: ${this.okeySpec.color} ${this.okeySpec.number}.`
    );
    this.startTurnTimer();
    this.emitUpdate();
    this.emitPrivateTiles();
    this.scheduleBotTurn();
  }

  tileLabel(tile) {
    return tile.joker ? 'Sahte Okey' : `${tile.color} ${tile.number}`;
  }

  // ---------- Actions ----------
  handleDraw(userId, source) {
    const idx = this.findSeatByUser(userId);
    if (idx === -1) return { error: 'Masada degilsiniz.' };
    if (this.turnSeat !== idx) return { error: 'Sira sizde degil.' };
    if (this.hasDrawn) return { error: 'Zaten tas cektiniz, simdi atmaniz gerekiyor.' };

    let tile;
    if (source === 'discard') {
      if (!this.lastDiscard || this.lastDiscard.availableToSeat !== idx) {
        return { error: 'Iskartadan tas cekemezsiniz.' };
      }
      tile = this.lastDiscard.tile;
      const fromPile = this.discardPiles[this.lastDiscard.fromSeat];
      if (fromPile.length && fromPile[fromPile.length - 1].id === tile.id) fromPile.pop();
      this.lastDiscard = null;
      this.drawSource = 'discard';
    } else if (source === 'deck') {
      if (this.deck.length === 0) return { error: 'Deste bos.' };
      tile = this.deck.pop();
      this.drawSource = 'deck';
    } else {
      return { error: 'Gecersiz tas kaynagi.' };
    }

    this.seats[idx].tiles.push(tile);
    this.hasDrawn = true;
    this.clearTurnTimer();
    this.startTurnTimer();
    this.log(`${this.seats[idx].name} ${source === 'deck' ? 'desteden' : 'iskartadan'} tas cekti.`);
    this.emitUpdate();
    this.emitPrivateTiles();
    return { ok: true };
  }

  handleDiscard(userId, tileId) {
    const idx = this.findSeatByUser(userId);
    if (idx === -1) return { error: 'Masada degilsiniz.' };
    if (this.turnSeat !== idx) return { error: 'Sira sizde degil.' };
    if (!this.hasDrawn) return { error: 'Once tas cekmeniz gerekiyor.' };

    const seat = this.seats[idx];
    const tileIdx = seat.tiles.findIndex((t) => t.id === tileId);
    if (tileIdx === -1) return { error: 'Bu tas elinizde degil.' };

    const [tile] = seat.tiles.splice(tileIdx, 1);
    const nextSeat = this.nextOccupiedSeat(idx);
    this.lastDiscard = { tile, fromSeat: idx, availableToSeat: nextSeat };
    this.discardPiles[idx].push(tile);
    this.log(`${seat.name} ${this.tileLabel(tile)} atti.`);

    this.clearTurnTimer();
    this.turnSeat = nextSeat;
    this.hasDrawn = false;
    this.drawSource = null;
    this.startTurnTimer();
    this.emitUpdate();
    this.emitPrivateTiles();

    if (this.deck.length === 0) {
      this.voidHand('Deste tukendi.');
      return { ok: true };
    }
    this.scheduleBotTurn();
    return { ok: true };
  }

  handleFinish(userId) {
    const idx = this.findSeatByUser(userId);
    if (idx === -1) return { error: 'Masada degilsiniz.' };
    if (this.turnSeat !== idx) return { error: 'Sira sizde degil.' };
    if (!this.hasDrawn) return { error: 'Once tas cekmeniz gerekiyor.' };

    const seat = this.seats[idx];
    const outcome = this.findFinishingSplit(seat.tiles);
    if (!outcome) return { error: 'Eliniz bitis icin gecerli degil.' };

    this.clearTurnTimer();
    this.settleHand(idx, outcome.ciftBitti).catch((err) => console.error('Okey el sonucu islenemedi:', err));
    return { ok: true };
  }

  // 15 tasin herhangi birini kenara ayirinca gecerli bir 14'luk el kaliyor mu
  // diye arar. Cift ile bitis mumkunse (daha yuksek odul) onu tercih eder.
  findFinishingSplit(tiles15) {
    let normalFound = false;
    for (let i = 0; i < tiles15.length; i++) {
      const remaining = tiles15.slice(0, i).concat(tiles15.slice(i + 1));
      if (okey.canFormSevenPairs(remaining, this.okeySpec)) {
        return { ciftBitti: true };
      }
      if (!normalFound && okey.canFormRunsAndSets(remaining, this.okeySpec)) {
        normalFound = true;
      }
    }
    if (normalFound) return { ciftBitti: false };
    return null;
  }

  seatHoldsRealOkey(seat) {
    return seat.tiles.some((t) => !t.joker && t.color === this.okeySpec.color && t.number === this.okeySpec.number);
  }

  async settleHand(winnerIdx, ciftBitti) {
    this.stage = 'finished';
    this.turnSeat = null;
    const winner = this.seats[winnerIdx];
    const eldenBitti = this.drawSource === 'deck';

    const participants = [];
    let totalWon = 0;
    for (let i = 0; i < SEATS; i++) {
      if (i === winnerIdx) continue;
      const loser = this.seats[i];
      if (!loser) continue;
      const holdsOkey = this.seatHoldsRealOkey(loser);
      const multiplier = (eldenBitti ? 2 : 1) * (ciftBitti ? 2 : 1) * (holdsOkey ? 2 : 1);
      const amount = BASE_STAKE * multiplier;
      totalWon += amount;
      participants.push({ userId: loser.userId, name: loser.name, ltChange: -amount });
    }
    participants.push({ userId: winner.userId, name: winner.name, ltChange: totalWon });

    for (const p of participants) {
      if (p.userId > 0) await db.adjustLt(p.userId, p.ltChange); // botlar (negatif id) DB'ye yazilmaz
    }

    this.lastHandSummary = {
      winnerName: winner.name,
      amount: totalWon,
      eldenBitti,
      ciftBitti,
    };
    this.log(
      `${winner.name} eli bitirdi ve ${totalWon} LT kazandi.` +
        `${eldenBitti ? ' (Elden)' : ''}${ciftBitti ? ' (Cift)' : ''}`
    );

    this.emit('hand-result', { handNumber: this.handNumber, participants });
    this.finishHand();
  }

  voidHand(reason) {
    this.clearTurnTimer();
    this.stage = 'finished';
    this.turnSeat = null;
    this.lastHandSummary = { winnerName: null, amount: 0, reason };
    this.log(`El berabere bitti: ${reason}`);
    this.finishHand();
  }

  finishHand() {
    this.clearTurnTimer();
    clearTimeout(this.botTimer);
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
    for (let i = 0; i < SEATS; i++) {
      const s = this.seats[i];
      if (s && s.leavingAfterHand) {
        this.log(`${s.name} masadan kalkti.`);
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
    if (idx === null || this.stage !== 'playing') return;
    const seat = this.seats[idx];
    if (!seat) return;

    if (!this.hasDrawn) {
      if (this.deck.length === 0) {
        this.voidHand('Deste tukendi.');
        return;
      }
      this.handleDraw(seat.userId, 'deck');
      // Cekme sonrasi otomatik atma icin kisa bir gecikme.
      this.turnTimer = setTimeout(() => this.handleTimeout(), 1500);
      this.turnDeadline = Date.now() + 1500;
      return;
    }

    const randomIdx = Math.floor(Math.random() * seat.tiles.length);
    const tile = seat.tiles[randomIdx];
    this.log(`${seat.name} suresi doldu, otomatik tas atti.`);
    this.handleDiscard(seat.userId, tile.id);
  }

  // ---------- State ----------
  getPublicState() {
    return {
      stage: this.stage,
      handNumber: this.handNumber,
      dealerSeat: this.dealerSeat,
      turnSeat: this.turnSeat,
      turnDeadline: this.turnDeadline,
      hasDrawn: this.hasDrawn,
      nextHandAt: this.nextHandAt,
      indicator: this.indicator,
      okeySpec: this.okeySpec,
      deckCount: this.deck.length,
      gameMode: this.gameMode || 'Tekli',
      gameType: this.gameType || 'Katlamasız',
      lastDiscard: this.lastDiscard
        ? {
            tile: this.lastDiscard.tile,
            fromSeat: this.lastDiscard.fromSeat,
            availableToSeat: this.lastDiscard.availableToSeat,
          }
        : null,
      minBalanceToSit: MIN_BALANCE_TO_SIT,
      baseStake: BASE_STAKE,
      seatCount: SEATS,
      discardPiles: this.discardPiles.map((pile) => ({
        count: pile.length,
        top: pile.length ? pile[pile.length - 1] : null,
      })),
      lastHandSummary: this.lastHandSummary,
      seats: this.seats.map((s, i) =>
        s
          ? {
              seatIndex: i,
              userId: s.userId,
              name: s.name,
              isBot: !!s.isBot,
              tileCount: s.tiles.length,
              isTurn: this.turnSeat === i,
              isDealer: this.dealerSeat === i,
              leavingAfterHand: s.leavingAfterHand,
            }
          : null
      ),
    };
  }
}

module.exports = { OkeyTable, SEATS, MIN_PLAYERS, BASE_STAKE, MIN_BALANCE_TO_SIT };
