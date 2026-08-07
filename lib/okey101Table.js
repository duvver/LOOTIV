const EventEmitter = require('node:events');
const db = require('./db');
const okey = require('./okeyLogic'); // tas seti, karistirma, gosterge, okey belirleme
const logic = require('./okey101Logic');

const SEATS = 4;
const MIN_PLAYERS = 2; // botlarla test icin
const STAKE = 20; // her oyuncunun ortaya koydugu LT
const OPEN_MIN = 101; // seri acma alt siniri
const CIFT_MIN = 5; // cift acma icin en az cift sayisi
// Limit is removed as per rules
const BOT_NAMES = ['BotAyla', 'BotKemal', 'BotZehra', 'BotOzan'];
const BOT_ACTION_DELAY_MS = 1500;
const TURN_TIMEOUT_MS = 35000;
const START_DELAY_MS = 6000;
const BETWEEN_HANDS_DELAY_MS = 3000;
const NEXT_HAND_DELAY_MS = 6000;

class Okey101Table extends EventEmitter {
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
    this.lastDiscard = null;
      this.lastDrawnDiscard = null; // { tile, fromSeat, availableToSeat }
    this.discardPiles = [[], [], [], []];
    this.boardMelds = []; // { id, kind:'seri'|'per'|'cift', tiles, lo,hi,color | number,colorsUsed, ownerSeat }
    this.meldIdCounter = 0;
    this.processCounts = new Map(); // meldId -> bu sirada islenen tas sayisi
    this.turnTimer = null;
    this.turnDeadline = null;
    this.startTimer = null;
    this.pendingStartCountdown = false;
    this.nextHandAt = null;
    this.handNumber = 0;
    this.lastHandSummary = null;
    this.isKatlamali = true;
    this.currentMinScore = OPEN_MIN;
    this.currentMinCift = CIFT_MIN;
  }

  // ---------- Yardimcilar ----------
  findSeatByUser(userId) {
    return this.seats.findIndex((s) => s && s.userId === userId);
  }

  isBotSeat(idx) {
    return !!(this.seats[idx] && this.seats[idx].isBot);
  }

  firstEmptySeat() {
    return this.seats.findIndex((s) => !s);
  }

  seatedCount() {
    return this.seats.filter(Boolean).length;
  }

  // Sira SAGA doner: 0=alt, 1=sol, 2=ust, 3=sag -> 0 -> 3 -> 2 -> 1 -> 0
  nextOccupiedSeat(fromIdx) {
    for (let step = 1; step <= SEATS; step++) {
      const next = (fromIdx - step + SEATS * 2) % SEATS;
      if (this.seats[next]) return next;
    }
    return fromIdx;
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

  // ---------- Oturma / kalkma / botlar ----------
  async sit(user, seatIndex) {
    if (this.findSeatByUser(user.id) !== -1) return { ok: true, alreadySeated: true };
    if (!Number.isInteger(seatIndex) || seatIndex < 0 || seatIndex >= SEATS) {
      return { error: 'Gecersiz koltuk.' };
    }
    if (this.seats[seatIndex]) return { error: 'Koltuk dolu.' };

    const freshUser = await db.getUserById(user.id);
    if (!freshUser) return { error: 'Kullanici bulunamadi.' };
    // Test kolayligi: bakiye kontrolu kapali. Uretimde acin:
    // if (freshUser.lt_balance < STAKE * 4) return { error: `Oturmak icin en az ${STAKE * 4} LT gerekli.` };
    if (this.seats[seatIndex]) return { error: 'Koltuk dolu.' };

    this.seats[seatIndex] = {
      userId: user.id,
      name: freshUser.rumuz,
      tiles: [],
      hasOpened: false,
      openKind: null, // 'seri' | 'cift'
      leavingAfterHand: false,
      extraPenalty: 0,
      mustOpenThisTurn: false,
      extraPenalty: 0,
      mustOpenThisTurn: false,
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
    this.lastDrawnDiscard = null;
    this.discardPiles = [[], [], [], []];
    this.boardMelds = [];
    this.processCounts.clear();
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

  addBot(seatIndex = null) {
    let idx = seatIndex;
    if (idx === null || idx === undefined || !Number.isInteger(idx)) idx = this.firstEmptySeat();
    if (idx === -1 || idx < 0 || idx >= SEATS) return { error: 'Bos koltuk yok.' };
    if (this.seats[idx]) return { error: 'Koltuk dolu.' };

    this.botCounter++;
    const name =
      BOT_NAMES[(this.botCounter - 1) % BOT_NAMES.length] +
      (this.botCounter > BOT_NAMES.length ? this.botCounter : '');
    this.seats[idx] = {
      userId: -this.botCounter,
      name,
      tiles: [],
      hasOpened: false,
      openKind: null,
      leavingAfterHand: false,
      extraPenalty: 0,
      mustOpenThisTurn: false,
      extraPenalty: 0,
      mustOpenThisTurn: false,
      isBot: true,
    };
    this.log(`${name} (bot) masaya oturdu.`);
    this.emitUpdate();
    this.maybeScheduleStart();
    return { ok: true };
  }

  removeBots() {
    if (this.stage === 'playing') return { error: 'El oynanirken bot cikarilamaz.' };
    let removed = 0;
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

    if (!this.hasDrawn) {
      if (this.deck.length === 0) {
        this.settleByPenalty('Deste tukendi.');
        return;
      }
      this.handleDraw(seat.userId, 'deck');
      this.scheduleBotTurn();
      return;
    }

    // Basit bot: acmayi denemez, okey olmayan rastgele bir tas atar.
    const discardable = seat.tiles.filter((t) => !logic.isWild(t, this.okeySpec));
    const pool = discardable.length ? discardable : seat.tiles;
    const tile = pool[Math.floor(Math.random() * pool.length)];
    this.handleDiscard(seat.userId, tile.id);
  }

  // ---------- El yasam dongusu ----------
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
    this.isKatlamali = true;
    this.currentMinScore = OPEN_MIN;
    this.currentMinCift = CIFT_MIN;
    this.nextHandAt = null;
    this.lastDiscard = null;
      this.lastDrawnDiscard = null;
    this.discardPiles = [[], [], [], []];
    this.boardMelds = [];
    this.processCounts = new Map();
    this.hasDrawn = false;

    const shuffled = okey.shuffle(okey.createTileSet());
    const { indicator, deck } = okey.extractIndicator(shuffled);
    this.indicator = indicator;
    this.okeySpec = okey.realOkeySpecFor(indicator);

    this.dealerSeat = this.nextOccupiedSeat(this.dealerSeat);
    const starterSeat = this.nextOccupiedSeat(this.dealerSeat);

    for (const seat of this.seats) {
      if (!seat) continue;
      seat.tiles = [];
      seat.hasOpened = false;
      seat.openKind = null;
      seat.extraPenalty = 0;
      seat.mustOpenThisTurn = false;
      seat.canShowIndicator = true;
      seat.hasShownIndicator = false;
    }
    // Herkese 21, baslayana +1 (22)
    for (let round = 0; round < 21; round++) {
      for (let s = 0; s < SEATS; s++) {
        if (this.seats[s]) this.seats[s].tiles.push(deck.pop());
      }
    }
    this.seats[starterSeat].tiles.push(deck.pop());
    this.deck = deck;

    this.turnSeat = starterSeat;
    this.hasDrawn = true; // baslayan 22 tasla baslar, cekmis sayilir

    this.log(`El #${this.handNumber} basladi (101 Okey). Gosterge: ${this.tileLabel(this.indicator)}.`);
    this.startTurnTimer();
    this.emitUpdate();
    this.emitPrivateTiles();
    this.scheduleBotTurn();
  }

  tileLabel(tile) {
    return tile.joker ? 'Sahte Okey' : `${tile.color} ${tile.number}`;
  }

  // ---------- Aksiyonlar ----------
  handleDraw(userId, source) {
    const idx = this.findSeatByUser(userId);
    if (idx === -1) return { error: 'Masada degilsiniz.' };
    if (this.stage !== 'playing') return { error: 'El oynamiyor.' };
    if (this.turnSeat !== idx) return { error: 'Sira sizde degil.' };
    if (this.hasDrawn) return { error: 'Zaten tas cektiniz.' };

    const seat = this.seats[idx];
    let tile;
    if (source === 'discard') {
      if (!this.lastDiscard || this.lastDiscard.availableToSeat !== idx) {
        return { error: 'Alabileceginiz atilmis tas yok.' };
      }
      if (!seat.hasOpened) {
        seat.mustOpenThisTurn = true;
      }
      tile = this.lastDiscard.tile;
      const fromPile = this.discardPiles[this.lastDiscard.fromSeat];
      if (fromPile.length && fromPile[fromPile.length - 1].id === tile.id) fromPile.pop();
      this.lastDrawnDiscard = { tile: tile, fromSeat: this.lastDiscard.fromSeat, availableToSeat: this.lastDiscard.availableToSeat };
      this.lastDiscard = null;
      this.lastDrawnDiscard = null;
    } else if (source === 'deck') {
      if (this.deck.length === 0) {
        this.settleByPenalty('Deste tukendi.');
        return { ok: true };
      }
      tile = this.deck.pop();
    } else {
      return { error: 'Gecersiz tas kaynagi.' };
    }

    seat.tiles.push(tile);
    this.hasDrawn = true;
    seat.canShowIndicator = false;
    
    this.clearTurnTimer();
    this.startTurnTimer();
    this.log(`${seat.name} ${source === 'deck' ? 'desteden' : 'yerden'} tas cekti.`);
    this.emitUpdate();
    this.emitPrivateTiles();
    return { ok: true };
  }

  // groups: tas id dizilerinden olusan dizi. kind: 'seri' | 'cift'
  handleOpen(userId, kind, groups) {
    const idx = this.findSeatByUser(userId);
    if (idx === -1) return { error: 'Masada degilsiniz.' };
    if (this.stage !== 'playing') return { error: 'El oynamiyor.' };
    if (this.turnSeat !== idx) return { error: 'Sira sizde degil.' };
    if (!this.hasDrawn) return { error: 'Once tas cekmeniz gerekiyor.' };
    const seat = this.seats[idx];
    if (seat.hasOpened) return { error: 'Elinizi zaten actiniz. Artik isleme yapabilirsiniz.' };
    if (kind !== 'seri' && kind !== 'cift') return { error: 'Gecersiz acilis turu.' };
    if (!Array.isArray(groups) || groups.length === 0) {
      return { error: 'Acilacak grup bulunamadi. Taslari aralarinda bosluk birakarak gruplayin.' };
    }

    // Id -> tas eslestir; ayni tas iki grupta olamaz, hepsi elde olmali
    const used = new Set();
    const resolved = [];
    for (const g of groups) {
      if (!Array.isArray(g) || g.length === 0) return { error: 'Bos grup gonderilemez.' };
      const tiles = [];
      for (const id of g) {
        if (used.has(id)) return { error: 'Ayni tas iki grupta kullanilamaz.' };
        const t = seat.tiles.find((x) => x.id === id);
        if (!t) return { error: 'Grup icindeki bir tas elinizde degil.' };
        used.add(id);
        tiles.push(t);
      }
      resolved.push(tiles);
    }
    // Son tasi atabilmek icin en az 1 tas elde kalmali
    if (used.size >= seat.tiles.length) {
      return { error: 'Tum taslari acamazsiniz; atmak icin en az 1 tas elinizde kalmali.' };
    }

    const validated = [];
    if (kind === 'seri') {
      let total = 0;
      for (const tiles of resolved) {
        const v = logic.validateSeriOrPer(tiles, this.okeySpec);
        if (!v) {
          seat.extraPenalty += 101;
          this.log(`${seat.name} hatali acilis denedi (Gecersiz grup). +101 ceza.`);
          this.emitUpdate();
          return { error: `Gecersiz grup: ${tiles.map((t) => this.tileLabel(t)).join(', ')}` };
        }
        total += v.value;
        validated.push({ ...v, tiles });
      }
      if (total < this.currentMinScore) {
        seat.extraPenalty += 101;
        this.log(`${seat.name} hatali acilis denedi (Yetersiz sayi). +101 ceza.`);
        this.emitUpdate();
        return { error: `Acilis icin en az ${this.currentMinScore} gerekli. Gruplarinizin toplami: ${total}.` };
      }
      if (this.isKatlamali) {
        this.currentMinScore = total + 1;
      }
      seat.openKind = 'seri';
      this.log(`${seat.name} ${total} sayi ile elini acti.`);
    } else {
      for (const tiles of resolved) {
        const v = logic.validateCift(tiles, this.okeySpec);
        if (!v) {
          seat.extraPenalty += 101;
          this.log(`${seat.name} hatali cift denedi (Gecersiz cift). +101 ceza.`);
          this.emitUpdate();
          return { error: `Gecersiz cift: ${tiles.map((t) => this.tileLabel(t)).join(', ')}` };
        }
        validated.push({ ...v, tiles });
      }
      if (validated.length < this.currentMinCift) {
        seat.extraPenalty += 101;
        this.log(`${seat.name} hatali cift denedi (Yetersiz cift). +101 ceza.`);
        this.emitUpdate();
        return { error: `Cift acilisi icin en az ${this.currentMinCift} cift gerekli. Gonderilen: ${validated.length}.` };
      }
      if (this.isKatlamali) {
        this.currentMinCift = validated.length + 1;
      }
      seat.openKind = 'cift';
      this.log(`${seat.name} ${validated.length} cift ile elini acti.`);
    }

    // Taslari elden dus, board'a ekle
    for (const v of validated) {
      for (const t of v.tiles) {
        const i = seat.tiles.findIndex((x) => x.id === t.id);
        if (i !== -1) seat.tiles.splice(i, 1);
      }
      this.meldIdCounter++;
      const meld = { id: this.meldIdCounter, kind: v.kind, tiles: v.tiles, ownerSeat: idx };
      if (v.kind === 'seri') {
        meld.lo = v.lo;
        meld.hi = v.hi;
        meld.color = v.color;
      } else if (v.kind === 'per') {
        meld.number = v.number;
        meld.colorsUsed = v.colorsUsed.slice();
      }
      this.boardMelds.push(meld);
    }
    seat.hasOpened = true;
    seat.mustOpenThisTurn = false;

    const hasJoker = seat.tiles.some(t => logic.isWild(t, this.okeySpec));
    if (!hasJoker) {
      seat.exposedJoker = false;
    }

    this.clearTurnTimer();
    this.startTurnTimer();
    this.emitUpdate();
    this.emitPrivateTiles();
    return { ok: true };
  }

  handleProcess(userId, tileId, meldId, targetJokerId) {
    const idx = this.findSeatByUser(userId);
    if (idx === -1) return { error: 'Masada degilsiniz.' };
    if (this.stage !== 'playing') return { error: 'El oynamiyor.' };
    if (this.turnSeat !== idx) return { error: 'Sira sizde degil.' };
    if (!this.hasDrawn) return { error: 'Once tas cekmeniz gerekiyor.' };
    const seat = this.seats[idx];
    if (!seat.hasOpened) return { error: 'Isleme yapmak icin once elinizi acmalisiniz.' };

    const tIdx = seat.tiles.findIndex((t) => t.id === tileId);
    if (tIdx === -1) return { error: 'Bu tas elinizde degil.' };
    const meld = this.boardMelds.find((m) => m.id === Number(meldId));
    if (!meld) return { error: 'Boyle bir grup yok.' };
    if (meld.kind === 'cift') return { error: 'Cift gruplarina isleme yapilamaz.' };

    if (seat.tiles.length <= 1) {
      return { error: 'Son tasinizi isleyemezsiniz; atmak icin 1 tas kalmali.' };
    }

    const tile = seat.tiles[tIdx];

    if (targetJokerId) {
      if (logic.canReplaceJoker(meld, tile, targetJokerId, this.okeySpec)) {
        const jIdx = meld.tiles.findIndex(t => t.id === targetJokerId);
        const jokerTile = meld.tiles[jIdx];
        
        seat.tiles.splice(tIdx, 1);
        meld.tiles[jIdx] = tile;
        seat.tiles.push(jokerTile);
        
        seat.exposedJoker = true;
        this.log(`${seat.name} Okey'i aldı!`);
        
        const reValid = logic.validateSeriOrPer(meld.tiles, this.okeySpec);
        if (reValid) {
          if (reValid.lo) meld.lo = reValid.lo;
          if (reValid.hi) meld.hi = reValid.hi;
          if (reValid.colorsUsed) meld.colorsUsed = reValid.colorsUsed;
        }

        this.clearTurnTimer();
        this.startTurnTimer();
        this.emitUpdate();
        this.emitPrivateTiles();
        return { ok: true, jokerStolen: true, meldId: meld.id };
      } else {
        return { error: 'Bu tas bu okeyin yerine gecemez.' };
      }
    }

    if (meld.kind === 'seri') {
      const fit = logic.canProcessSeri(meld, tile, this.okeySpec);
      if (!fit) return { error: 'Bu tas bu seriye uymuyor.' };
      seat.tiles.splice(tIdx, 1);
      if (fit.at === 'end') meld.tiles.push(tile);
      else meld.tiles.unshift(tile);
      meld.lo = fit.lo;
      meld.hi = fit.hi;
    } else {
      const fit = logic.canProcessPer(meld, tile, this.okeySpec);
      if (!fit) return { error: 'Bu tas bu pere uymuyor.' };
      seat.tiles.splice(tIdx, 1);
      meld.tiles.push(tile);
      if (!logic.isWild(tile, this.okeySpec)) meld.colorsUsed.push(tile.color);
    }

    this.log(`${seat.name} bir tas isledi.`);
    
    const hasJoker = seat.tiles.some(t => logic.isWild(t, this.okeySpec));
    if (!hasJoker) {
      seat.exposedJoker = false;
    }

    this.clearTurnTimer();
    this.startTurnTimer();
    this.emitUpdate();
    this.emitPrivateTiles();
    return { ok: true };
  }


  handleUndoDraw(userId) {
    const idx = this.findSeatByUser(userId);
    if (idx === -1) return { error: 'Masada degilsiniz.' };
    if (this.stage !== 'playing') return { error: 'El oynamiyor.' };
    if (this.turnSeat !== idx) return { error: 'Sira sizde degil.' };
    if (!this.hasDrawn) return { error: 'Henuz tas cekmediniz.' };
    
    const seat = this.seats[idx];
    if (!seat.mustOpenThisTurn || !this.lastDrawnDiscard) {
        return { error: 'Sadece yerden cektiginiz tasi geri birakabilirsiniz.' };
    }
    
    const tileId = this.lastDrawnDiscard.tile.id;
    const tileIdx = seat.tiles.findIndex(t => t.id === tileId);
    if (tileIdx === -1) return { error: 'Cektiginiz tas ıstakanizda degil.' };
    
    const [tile] = seat.tiles.splice(tileIdx, 1);
    this.discardPiles[this.lastDrawnDiscard.fromSeat].push(tile);
    
    this.lastDiscard = this.lastDrawnDiscard;
    this.lastDrawnDiscard = null;
    
    seat.mustOpenThisTurn = false;
    this.hasDrawn = false;
    
    this.log(`${seat.name} yerden aldigi tasi geri birakti.`);
    this.emitUpdate();
    this.emitPrivateTiles();
    return { ok: true };
  }

  handleShowIndicator(userId) {
    const idx = this.findSeatByUser(userId);
    if (idx === -1) return { error: 'Masada degilsiniz.' };
    if (this.stage !== 'playing') return { error: 'El oynamiyor.' };
    
    const seat = this.seats[idx];
    if (!seat.canShowIndicator) return { error: 'Gosterge gosterme hakkinizi kaybettiniz (Sira size gecti ve hamle yaptiniz).' };
    if (seat.hasShownIndicator) return { error: 'Gostergeyi zaten gosterdiniz.' };

    const hasIndicator = seat.tiles.some(t => !t.joker && t.color === this.indicator.color && t.number === this.indicator.number);
    if (!hasIndicator) return { error: 'Elinizde gosterge tasi yok.' };

    seat.hasShownIndicator = true;
    this.log(`${seat.name} gosterge gosterdi! Diger oyuncular +101 ceza yedi.`);
    
    // Penalize all other players
    for (let i = 0; i < SEATS; i++) {
      if (i !== idx && this.seats[i]) {
        this.seats[i].extraPenalty += 101;
      }
    }

    this.emitUpdate();
    return { ok: true };
  }

  handleDiscard(userId, tileId) {
    const idx = this.findSeatByUser(userId);
    if (idx === -1) return { error: 'Masada degilsiniz.' };
    if (this.stage !== 'playing') return { error: 'El oynamiyor.' };
    if (this.turnSeat !== idx) return { error: 'Sira sizde degil.' };
    if (!this.hasDrawn) return { error: 'Once tas cekmeniz gerekiyor.' };

    const seat = this.seats[idx];
    
    if (seat.mustOpenThisTurn) {
      return { error: 'Yerden tas aldiniz. Elinizi acmak zorundasiniz veya tasi geri birakmalisiniz.' };
    }

    const tileIdx = seat.tiles.findIndex((t) => t.id === tileId);
    if (tileIdx === -1) return { error: 'Bu tas elinizde degil.' };

    const [tile] = seat.tiles.splice(tileIdx, 1);
    
    const isOkey = (!tile.joker && tile.color === this.okeySpec.color && tile.number === this.okeySpec.number);
    const isFinishing = (seat.tiles.length === 0 && seat.hasOpened);

    if (isOkey && !isFinishing) {
      seat.extraPenalty += 101;
      this.log(`${seat.name} yere Okey atti! +101 ceza.`);
    }

    // İşlek taş kontrolü (Processable tile penalty)
    let isProcessable = false;
    for (const meld of this.boardMelds) {
      if (meld.kind === 'seri' && logic.canProcessSeri(meld, tile, this.okeySpec)) {
        isProcessable = true;
        break;
      }
      if (meld.kind === 'per' && logic.canProcessPer(meld, tile, this.okeySpec)) {
        isProcessable = true;
        break;
      }
    }

    if (isProcessable && !isFinishing) {
      seat.extraPenalty += 101;
      this.log(`${seat.name} işlek taş (${this.tileLabel(tile)}) atti! +101 ceza.`);
    }
    
    seat.exposedJoker = false;

    const nextSeat = this.nextOccupiedSeat(idx);
    this.lastDiscard = { tile, fromSeat: idx, availableToSeat: nextSeat };
    this.discardPiles[idx].push(tile);
    this.log(`${seat.name} ${this.tileLabel(tile)} atti.`);

    seat.canShowIndicator = false;

    if (isFinishing) {
      this.settleFinished(idx, isOkey);
      return { ok: true };
    }

    const hasJoker = seat.tiles.some(t => logic.isWild(t, this.okeySpec));
    if (!hasJoker) {
      seat.exposedJoker = false;
    }

    this.clearTurnTimer();
    this.turnSeat = nextSeat;
    this.hasDrawn = false;
    this.startTurnTimer();
    this.emitUpdate();
    this.emitPrivateTiles();

    return this.nextTurn();
  }

  nextTurn() {
    if (this.deck.length === 0) {
      this.settleByPenalty('Deste tukendi.');
      return { ok: true };
    }
    this.scheduleBotTurn();
    return { ok: true };
  }

  // ---------- El sonu ----------
  computePenalties() {
    const rows = [];
    for (let i = 0; i < SEATS; i++) {
      const s = this.seats[i];
      if (!s) continue;

      let tilePenalty = 0;
      if (!s.hasOpened) {
        // In 101 Okey, players who haven't opened their hand receive a flat 202 penalty
        tilePenalty = 202;
      } else {
        // Players who opened calculate penalty based on remaining tiles
        tilePenalty = logic.penaltyOf(s.tiles, this.okeySpec);
        
        // If they went for pairs (Çift) but didn't finish, their remaining tile penalty is doubled
        if (s.openKind === 'cift') {
          tilePenalty *= 2;
        }
      }

      rows.push({
        seatIdx: i,
        userId: s.userId,
        name: s.name,
        opened: s.hasOpened,
        penalty: tilePenalty + (s.extraPenalty || 0),
      });
    }
    return rows;
  }

  distributePot(rows, finisherIdx = null) {
    const n = rows.length;
    const pot = STAKE * n;
    const payout = new Map(rows.map((r) => [r.seatIdx, 0]));

    const openers = rows.filter((r) => r.opened);
    if (openers.length === 0) {
      // Kimse acmadi: herkes kendi koydugunu geri alir (net 0)
      for (const r of rows) payout.set(r.seatIdx, STAKE);
      return { payout, note: 'Kimse elini acmadi, LT iade edildi.' };
    }
    if (openers.length === 1) {
      payout.set(openers[0].seatIdx, pot);
      return { payout, note: null };
    }

    // Birden cok acan: en dusuk ceza 3/4, ikinci en dusuk 1/4 (esitler bolusur)
    const sorted = openers.slice().sort((a, b) => a.penalty - b.penalty);
    const minPen = sorted[0].penalty;
    const firstGroup = sorted.filter((r) => r.penalty === minPen);
    const rest = sorted.filter((r) => r.penalty !== minPen);

    if (rest.length === 0) {
      // hepsi esit: potu bolusurler
      const share = Math.floor(pot / firstGroup.length);
      let remainder = pot - share * firstGroup.length;
      for (const r of firstGroup) {
        payout.set(r.seatIdx, share + (remainder > 0 ? 1 : 0));
        if (remainder > 0) remainder--;
      }
      return { payout, note: null };
    }

    const secondPen = rest[0].penalty;
    const secondGroup = rest.filter((r) => r.penalty === secondPen);
    const firstPot = Math.floor((pot * 3) / 4);
    const secondPot = pot - firstPot;

    let share = Math.floor(firstPot / firstGroup.length);
    let remainder = firstPot - share * firstGroup.length;
    for (const r of firstGroup) {
      payout.set(r.seatIdx, share + (remainder > 0 ? 1 : 0));
      if (remainder > 0) remainder--;
    }
    share = Math.floor(secondPot / secondGroup.length);
    remainder = secondPot - share * secondGroup.length;
    for (const r of secondGroup) {
      payout.set(r.seatIdx, share + (remainder > 0 ? 1 : 0));
      if (remainder > 0) remainder--;
    }
    return { payout, note: null };
  }

  async settleCommon(rows, reason, finisherIdx = null) {
    this.stage = 'finished';
    this.turnSeat = null;
    this.clearTurnTimer();
    clearTimeout(this.botTimer);

    const { payout, note } = this.distributePot(rows, finisherIdx);
    const participants = [];
    for (const r of rows) {
      const net = (payout.get(r.seatIdx) || 0) - STAKE;
      participants.push({ userId: r.userId, name: r.name, ltChange: net, penalty: r.penalty, opened: r.opened });
      if (r.userId > 0 && net !== 0) {
        let actualNet = net;
        if (net < 0) {
          const dbUser = await db.getUserById(r.userId);
          if (dbUser && dbUser.lt < Math.abs(net)) {
            actualNet = -dbUser.lt;
          }
        }
        await db.adjustLt(r.userId, actualNet);
      }
    }

    const winners = participants
      .filter((p) => p.ltChange > 0)
      .map((p) => `${p.name} (+${p.ltChange} LT)`)
      .join(', ');

    this.lastHandSummary = {
      reason,
      finisherName: finisherIdx !== null && this.seats[finisherIdx] ? this.seats[finisherIdx].name : null,
      note,
      results: participants.map((p) => ({
        name: p.name,
        penalty: p.penalty,
        opened: p.opened,
        ltChange: p.ltChange,
      })),
    };

    this.log(
      `El bitti (${reason}). ` +
        (winners ? `Kazanan: ${winners}.` : note || 'Kazanan yok.')
    );

    this.emit('hand-result', { handNumber: this.handNumber, participants });
    this.finishHand();
  }

  settleFinished(finisherIdx, isOkeyFinish = false) {
    const rows = this.computePenalties();
    const finisherSeat = this.seats[finisherIdx];
    const isCiftFinish = finisherSeat && finisherSeat.openKind === 'cift';
    
    let multiplier = 1;
    if (isOkeyFinish) multiplier *= 2;
    if (isCiftFinish) multiplier *= 2;

    if (multiplier > 1) {
      for (const r of rows) {
        if (r.seatIdx !== finisherIdx) {
          r.penalty *= multiplier;
        }
      }
    }

    // bitiren oyuncunun cezasi zaten 0 (eli bos)
    const name = finisherSeat ? finisherSeat.name : '';
    let reason = `${name} elini bitirdi`;
    if (isOkeyFinish && isCiftFinish) reason = `${name} Çifte gidip Okey atarak bitirdi (x4)!`;
    else if (isOkeyFinish) reason = `${name} Okey atarak bitirdi (x2)!`;
    else if (isCiftFinish) reason = `${name} Çifte giderek bitirdi (x2)!`;
    
    this.settleCommon(rows, reason, finisherIdx).catch((err) =>
      console.error('101 el sonucu islenemedi:', err)
    );
  }

  settleByPenalty(reason) {
    const rows = this.computePenalties();
    this.settleCommon(rows, reason).catch((err) => console.error('101 el sonucu islenemedi:', err));
  }

  finishHand() {
    this.emitUpdate();
    this.startTimer = setTimeout(async () => {
      await this.cleanupAfterHand();
      this.stage = 'waiting';
      this.turnSeat = null;
      this.boardMelds = [];
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
    this.checkAutoCleanup();
  }

  // ---------- Sure ----------
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
        this.settleByPenalty('Deste tukendi.');
        return;
      }
      this.handleDraw(seat.userId, 'deck');
      this.turnTimer = setTimeout(() => this.handleTimeout(), 1500);
      this.turnDeadline = Date.now() + 1500;
      return;
    }

    const discardable = seat.tiles.filter((t) => !logic.isWild(t, this.okeySpec));
    const pool = discardable.length ? discardable : seat.tiles;
    const tile = pool[Math.floor(Math.random() * pool.length)];
    this.log(`${seat.name} suresi doldu, otomatik tas atti.`);
    this.handleDiscard(seat.userId, tile.id);
  }

  // ---------- Durum ----------
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
      stake: STAKE,
      gameMode: this.gameMode || 'Tek',
      gameType: this.gameType || (this.isKatlamali ? 'Katlamalı' : 'Katlamasız'),
      openMin: this.currentMinScore,
      ciftMin: this.currentMinCift,
      isKatlamali: this.isKatlamali,
      lastDiscard: this.lastDiscard
        ? {
            tile: this.lastDiscard.tile,
            fromSeat: this.lastDiscard.fromSeat,
            availableToSeat: this.lastDiscard.availableToSeat,
          }
        : null,
      discardPiles: this.discardPiles.map((pile) => ({
        count: pile.length,
        top: pile.length ? pile[pile.length - 1] : null,
      })),
      boardMelds: this.boardMelds.map((m) => ({
        id: m.id,
        kind: m.kind,
        ownerSeat: m.ownerSeat,
        tiles: m.tiles,
      })),
      seatCount: SEATS,
      lastHandSummary: this.lastHandSummary,
      seats: this.seats.map((s, i) =>
        s
          ? {
              seatIndex: i,
              userId: s.userId,
              name: s.name,
              isBot: !!s.isBot,
              tileCount: s.tiles.length,
              hasOpened: s.hasOpened,
              openKind: s.openKind,
              isTurn: this.turnSeat === i,
              isDealer: this.dealerSeat === i,
              leavingAfterHand: s.leavingAfterHand,
              extraPenalty: s.extraPenalty,
              mustOpenThisTurn: s.mustOpenThisTurn,
              canShowIndicator: s.canShowIndicator,
              hasShownIndicator: s.hasShownIndicator,
            }
          : null
      ),
    };
  }
}

module.exports = { Okey101Table, SEATS, MIN_PLAYERS, STAKE };
