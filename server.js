const fs = require('node:fs');
const path = require('node:path');

function writeStartupLog(label, err) {
  const line = `\n[${new Date().toISOString()}] ${label}\n${err && err.stack ? err.stack : err}\n`;
  try {
    fs.appendFileSync(path.join(__dirname, 'startup-error.log'), line);
  } catch (writeErr) {
    // dosyaya yazilamiyorsa yapacak bir sey yok, en azindan stderr'e dusun
  }
  console.error(label, err);
}

process.on('uncaughtException', (err) => {
  writeStartupLog('uncaughtException', err);
  process.exit(1);
});
process.on('unhandledRejection', (err) => {
  writeStartupLog('unhandledRejection', err);
});

require('dotenv').config();

const crypto = require('node:crypto');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
// Nginx Unit uzerinde calisirken (DirectAdmin "Nginx birimi") istekleri Node'a
// iletebilmesi icin unit-http modulunu kullanmasi gerekiyor. Bu paket kurulu
// degilse (ornegin Passenger/yerel gelistirme ortaminda) normal http modulune duser.
let http;
try {
  http = require('unit-http');
  console.log('unit-http modulu bulundu, Nginx Unit uyumlu modda calisiliyor.');
} catch (err) {
  http = require('node:http');
}
const { Server } = require('socket.io');

const db = require('./lib/db');
const { PokerTable } = require('./lib/pokerTable');
const { cardLabel } = require('./lib/pokerHand');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const RUMUZ_RE = /^[a-zA-Z0-9_]{3,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function asyncHandler(fn) {
  return (req, res, next) => fn(req, res, next).catch(next);
}

function generateCode() {
  return String(crypto.randomInt(100000, 999999));
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'lootiv-gizli-anahtar-degistir',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 },
});
app.use(sessionMiddleware);

// Socket.IO ile express-session paylasimi
io.engine.use((req, res, next) => sessionMiddleware(req, res, next));

const requireGuest = (req, res, next) => {
  if (req.session.userId) return res.redirect('/');
  next();
};

const attachUser = asyncHandler(async (req, res, next) => {
  if (req.session.userId) {
    await db.syncVip(req.session.userId).catch(() => {});
    const user = await db.getUserById(req.session.userId);
    if (user) req.user = user;
    else req.session.userId = null;
  }
  next();
});

const requireAuth = (req, res, next) => {
  if (!req.user) return res.redirect('/');
  next();
};

const requireAdmin = (req, res, next) => {
  if (!req.user || !req.user.is_admin) return res.redirect('/');
  next();
};

// ================= Ana sayfa / Lobi =================
app.get(
  '/',
  attachUser,
  asyncHandler(async (req, res) => {
    const loginError = req.session.loginError || null;
    const loginIdentifier = req.session.loginIdentifier || '';
    delete req.session.loginError;
    delete req.session.loginIdentifier;

    const dailyQuestion = await db.getDailyQuestion();
    const scratchConfig = await db.getScratchConfig();
    let dailyAnswer = null;
    let scratchToday = null;
    if (req.user) {
      if (dailyQuestion && dailyQuestion.active) {
        dailyAnswer = await db.getUserDailyAnswer(req.user.id, dailyQuestion.version);
      }
      if (scratchConfig && scratchConfig.active) {
        scratchToday = await db.getUserScratchToday(req.user.id);
      }
    }

    res.render('lobby', {
      user: req.user || null,
      loginError,
      loginIdentifier,
      dailyQuestion,
      dailyAnswer,
      scratchConfig,
      scratchToday,
      vipPlans: db.getVipPlans(),
    });
  })
);

// ---- Giris (topbar'daki inline form) ----
app.post(
  '/login',
  requireGuest,
  asyncHandler(async (req, res) => {
    const { identifier, password } = req.body;
    const user = identifier ? await db.getUserByIdentifier(identifier) : null;

    if (!user || !bcrypt.compareSync(password || '', user.password_hash)) {
      req.session.loginError = 'Rumuz/E-posta veya sifre hatali.';
      req.session.loginIdentifier = identifier || '';
      return res.redirect('/');
    }

    if (user.is_banned) {
      req.session.loginError = user.ban_reason
        ? `Hesabiniz yasaklandi: ${user.ban_reason}`
        : 'Hesabiniz yasaklandi.';
      req.session.loginIdentifier = identifier || '';
      return res.redirect('/');
    }

    req.session.userId = user.id;
    res.redirect('/');
  })
);

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// ---- Kayit ----
app.get('/register', requireGuest, (req, res) => {
  res.render('register', { error: null, form: {} });
});

app.post(
  '/register',
  requireGuest,
  asyncHandler(async (req, res) => {
    const { rumuz, email, password, password2, terms } = req.body;
    const form = { rumuz: rumuz || '', email: email || '' };

    if (!rumuz || !email || !password || !password2) {
      return res.render('register', { error: 'Lutfen tum alanlari doldurun.', form });
    }
    if (!RUMUZ_RE.test(rumuz)) {
      return res.render('register', {
        error: 'Rumuz 3-20 karakter olmali; sadece harf, rakam ve alt cizgi icerebilir.',
        form,
      });
    }
    if (!EMAIL_RE.test(email)) {
      return res.render('register', { error: 'Gecerli bir email adresi girin.', form });
    }
    if (password.length < 6) {
      return res.render('register', { error: 'Sifre en az 6 karakter olmali.', form });
    }
    if (password !== password2) {
      return res.render('register', { error: 'Sifreler eslesmiyor.', form });
    }
    if (!terms) {
      return res.render('register', { error: 'Devam etmek icin uyelik sartlarini onaylamalisiniz.', form });
    }
    if (await db.getUserByEmail(email)) {
      return res.render('register', { error: 'Bu email ile zaten bir hesap var.', form });
    }
    if (await db.getUserByRumuz(rumuz)) {
      return res.render('register', { error: 'Bu rumuz zaten kullaniliyor.', form });
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    const userId = await db.createUser({ rumuz, email, passwordHash, termsAccepted: true });

    req.session.userId = userId;
    res.redirect('/');
  })
);

// ================= Gunun sorusu =================
app.post(
  '/gunun-sorusu/cevapla',
  attachUser,
  requireAuth,
  asyncHandler(async (req, res) => {
    const question = await db.getDailyQuestion();
    if (!question || !question.active) return res.redirect('/');

    const existing = await db.getUserDailyAnswer(req.user.id, question.version);
    if (existing) return res.redirect('/');

    const selected = (req.body.option || '').toUpperCase();
    if (!['A', 'B', 'C', 'D'].includes(selected)) return res.redirect('/');

    const isCorrect = selected === question.correct_option;
    await db.submitDailyAnswer(req.user.id, question.version, selected, isCorrect, question.reward_lt);
    res.redirect('/');
  })
);

// ================= Kazi kazan =================
app.post(
  '/kazikazan/oyna',
  attachUser,
  requireAuth,
  asyncHandler(async (req, res) => {
    const config = await db.getScratchConfig();
    if (!config || !config.active) return res.redirect('/');

    const already = await db.getUserScratchToday(req.user.id);
    if (already) return res.redirect('/');

    await db.playScratch(req.user.id);
    res.redirect('/');
  })
);

// ================= Ayarlar / Profil dogrulama (demo modu) =================
// Not: Deneme surumu oldugu icin gercek email/SMS gonderimi KAPALI.
// Kod, gonderilmis gibi degil, dogrudan ekranda gosteriliyor.

async function renderProfileSettings(req, res, extra = {}) {
  const user = await db.getUserById(req.user.id);
  res.render('settings-profile', {
    user,
    error: null,
    info: null,
    emailCode: null,
    phoneCode: null,
    ...extra,
  });
}

app.get(
  '/settings/profile',
  attachUser,
  requireAuth,
  asyncHandler(async (req, res) => {
    await renderProfileSettings(req, res);
  })
);

app.post(
  '/settings/profile/email/send-code',
  attachUser,
  requireAuth,
  asyncHandler(async (req, res) => {
    if (req.user.email_verified) return res.redirect('/settings/profile');
    const code = generateCode();
    await db.setEmailVerificationCode(req.user.id, code);
    await renderProfileSettings(req, res, {
      emailCode: code,
      info: 'Demo modu: kod gercekten gonderilmedi, asagida gosteriliyor.',
    });
  })
);

app.post(
  '/settings/profile/email/verify',
  attachUser,
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await db.getUserById(req.user.id);
    const { code } = req.body;
    if (!user.email_verification_code || !code || code.trim() !== String(user.email_verification_code)) {
      return renderProfileSettings(req, res, { error: 'Kod hatali. Tekrar deneyin.' });
    }
    await db.verifyEmail(user.id);
    res.redirect('/settings/profile');
  })
);

app.post(
  '/settings/profile/phone',
  attachUser,
  requireAuth,
  asyncHandler(async (req, res) => {
    const phone = (req.body.phone || '').trim();
    if (!phone) {
      return renderProfileSettings(req, res, { error: 'Telefon numarasi girin.' });
    }
    await db.setPhone(req.user.id, phone);
    res.redirect('/settings/profile');
  })
);

app.post(
  '/settings/profile/phone/send-code',
  attachUser,
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await db.getUserById(req.user.id);
    if (!user.phone) {
      return renderProfileSettings(req, res, { error: 'Once bir telefon numarasi kaydedin.' });
    }
    if (user.phone_verified) return res.redirect('/settings/profile');
    const code = generateCode();
    await db.setPhoneVerificationCode(req.user.id, code);
    await renderProfileSettings(req, res, {
      phoneCode: code,
      info: 'Demo modu: kod gercekten gonderilmedi, asagida gosteriliyor.',
    });
  })
);

app.post(
  '/settings/profile/phone/verify',
  attachUser,
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await db.getUserById(req.user.id);
    const { code } = req.body;
    if (!user.phone_verification_code || !code || code.trim() !== String(user.phone_verification_code)) {
      return renderProfileSettings(req, res, { error: 'Kod hatali. Tekrar deneyin.' });
    }
    await db.verifyPhone(user.id);
    res.redirect('/settings/profile');
  })
);

// ---- Poker odasi ----
app.get('/poker', attachUser, requireAuth, (req, res) => {
  res.render('poker', { user: req.user });
});

// ================= Admin paneli =================
app.get(
  '/admin',
  attachUser,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const users = await db.getAllUsers();
    const stats = await db.getStats();
    const gameLogs = await db.getRecentGameLogs(150);
    const dailyQuestion = await db.getDailyQuestion();
    const scratchConfig = await db.getScratchConfig();
    res.render('admin', {
      user: req.user,
      users,
      stats,
      gameLogs,
      dailyQuestion,
      scratchConfig,
      vipPlans: db.getVipPlans(),
      savedMsg: req.query.saved || null,
    });
  })
);

app.post(
  '/admin/users/:id/mute',
  attachUser,
  requireAdmin,
  asyncHandler(async (req, res) => {
    await db.toggleMute(Number(req.params.id));
    res.redirect('/admin');
  })
);

app.post(
  '/admin/users/:id/ban',
  attachUser,
  requireAdmin,
  asyncHandler(async (req, res) => {
    await db.toggleBan(Number(req.params.id), req.body.reason);
    res.redirect('/admin');
  })
);

app.post(
  '/admin/users/:id/lt',
  attachUser,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const amount = Math.trunc(Number(req.body.amount));
    if (Number.isFinite(amount) && amount !== 0) {
      await db.adjustLt(Number(req.params.id), amount);
    }
    res.redirect('/admin');
  })
);

app.post(
  '/admin/users/:id/vip',
  attachUser,
  requireAdmin,
  asyncHandler(async (req, res) => {
    await db.setVip(Number(req.params.id), Number(req.body.tier));
    res.redirect('/admin');
  })
);

app.post(
  '/admin/gunun-sorusu',
  attachUser,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { questionText, optionA, optionB, optionC, optionD, correctOption, rewardLt, active } = req.body;
    await db.upsertDailyQuestion({
      questionText,
      optionA,
      optionB,
      optionC,
      optionD,
      correctOption: (correctOption || '').toUpperCase(),
      rewardLt: Math.max(0, Math.trunc(Number(rewardLt)) || 0),
      active: active === 'on' || active === '1' || active === 'true',
    });
    res.redirect('/admin?saved=gunun-sorusu');
  })
);

app.post(
  '/admin/kazikazan',
  attachUser,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { prizes, active } = req.body;
    const cleanedPrizes = (prizes || '')
      .split(',')
      .map((p) => p.trim())
      .filter((p) => p !== '' && Number.isFinite(Number(p)))
      .join(',');
    await db.upsertScratchConfig({
      prizes: cleanedPrizes || '0',
      active: active === 'on' || active === '1' || active === 'true',
    });
    res.redirect('/admin?saved=kazikazan');
  })
);

// ---- 500 hata sayfasi (asyncHandler'dan gelen hatalar) ----
app.use((err, req, res, next) => {
  writeStartupLog(`Route hatasi: ${req.method} ${req.originalUrl}`, err);
  res.status(500).send('Bir sunucu hatasi olustu.');
});

// ================= Socket.IO (Turk Pokeri) =================
const onlinePlayers = new Map(); // socket.id -> { userId, name }
const CHANNELS = ['genel', 'oyun', 'sistem'];

function broadcastPlayers() {
  const uniqueByUser = new Map();
  for (const p of onlinePlayers.values()) uniqueByUser.set(p.userId, p.name);
  io.emit('poker:players', Array.from(uniqueByUser.values()));
}

async function systemMessage(text) {
  const saved = await db.insertMessage({ userId: null, username: 'Sistem', channel: 'sistem', content: text });
  io.emit('chat:message', {
    channel: 'sistem',
    username: 'Sistem',
    content: text,
    created_at: saved.created_at,
  });
}

async function gameLogMessage(text) {
  const saved = await db.insertMessage({ userId: null, username: 'Masa', channel: 'oyun', content: text });
  io.emit('chat:message', {
    channel: 'oyun',
    username: 'Masa',
    content: text,
    created_at: saved.created_at,
  });
}

const table = new PokerTable();
const pendingStandTimers = new Map();
const RECONNECT_GRACE_MS = 8000;

table.on('log', (text) => gameLogMessage(text).catch(console.error));
table.on('update', (state) => io.emit('table:state', state));
table.on('private-cards', (payload) => {
  for (const { userId, cards } of payload) {
    for (const [, s] of io.sockets.sockets) {
      if (s.request.session && s.request.session.userId === userId) {
        s.emit('table:cards', cards);
      }
    }
  }
});
table.on('hand-result', ({ handNumber, participants }) => {
  (async () => {
    for (const p of participants) {
      try {
        const freshUser = await db.getUserById(p.userId);
        const dbBalance = freshUser ? freshUser.lt_balance : 0;
        const totalSnapshot = dbBalance + p.stackAfter;
        const result = p.netChange > 0 ? 'win' : p.netChange < 0 ? 'lose' : 'berabere';
        await db.logGameResult({
          userId: p.userId,
          rumuz: p.name,
          handNumber,
          playedLt: p.played,
          result,
          ltChange: p.netChange,
          totalLtSnapshot: totalSnapshot,
        });
      } catch (err) {
        console.error('Oyun logu yazilamadi:', err);
      }
    }
  })();
});

io.on('connection', (socket) => {
  (async () => {
    const session = socket.request.session;
    if (!session || !session.userId) {
      socket.disconnect(true);
      return;
    }
    const user = await db.getUserById(session.userId);
    if (!user || user.is_banned) {
      socket.disconnect(true);
      return;
    }

    const name = user.rumuz;
    onlinePlayers.set(socket.id, { userId: user.id, name });

    const pendingStand = pendingStandTimers.get(user.id);
    if (pendingStand) {
      clearTimeout(pendingStand);
      pendingStandTimers.delete(user.id);
    }

    {
      const uniqueByUser = new Map();
      for (const p of onlinePlayers.values()) uniqueByUser.set(p.userId, p.name);
      socket.emit('poker:players', Array.from(uniqueByUser.values()));
    }

    const history = {};
    for (const ch of CHANNELS) history[ch] = await db.getRecentMessages(ch, 50);
    socket.emit('chat:history', history);

    broadcastPlayers();
    systemMessage(`${name} masaya katildi.`).catch(console.error);

    socket.emit('table:state', table.getPublicState());
    const mySeat = table.seats.find((s) => s && s.userId === user.id);
    if (mySeat && mySeat.cards.length) {
      socket.emit('table:cards', mySeat.cards.map(cardLabel));
    }

    socket.on('table:sit', async (payload) => {
      const seatIndex = Number(payload && payload.seatIndex);
      const res = await table.sit(user, seatIndex);
      if (res.error) socket.emit('table:error', res.error);
    });

    socket.on('table:stand', async () => {
      const res = await table.stand(user.id);
      if (res.error) socket.emit('table:error', res.error);
    });

    socket.on('table:action', (payload) => {
      const res = table.handleAction(user.id, payload && payload.action, payload && payload.amount);
      if (res.error) socket.emit('table:error', res.error);
    });

    socket.on('chat:message', async (payload) => {
      if (!payload || typeof payload.text !== 'string') return;
      const channel = payload.channel;
      if (channel !== 'genel' && channel !== 'oyun') return;
      const text = payload.text.trim().slice(0, 500);
      if (!text) return;

      const saved = await db.insertMessage({ userId: user.id, username: name, channel, content: text });
      io.emit('chat:message', {
        channel,
        username: name,
        content: text,
        created_at: saved.created_at,
      });
    });

    socket.on('disconnect', () => {
      onlinePlayers.delete(socket.id);
      broadcastPlayers();
      systemMessage(`${name} masadan ayrildi.`).catch(console.error);
      const stillConnected = Array.from(onlinePlayers.values()).some((p) => p.userId === user.id);
      if (!stillConnected && table.findSeatByUser(user.id) !== -1) {
        const timer = setTimeout(() => {
          pendingStandTimers.delete(user.id);
          table.stand(user.id).catch(console.error);
        }, RECONNECT_GRACE_MS);
        pendingStandTimers.set(user.id, timer);
      }
    });
  })().catch((err) => {
    console.error('Socket baglanti hatasi:', err);
    socket.disconnect(true);
  });
});

async function refundSeatedPlayers() {
  for (const seat of table.seats) {
    if (seat && seat.stack > 0) {
      const amount = seat.stack;
      seat.stack = 0;
      await db.adjustLt(seat.userId, amount);
      console.log(`Sunucu kapanirken ${seat.name} adli oyuncuya ${amount} LT iade edildi.`);
    }
  }
}

function gracefulShutdown() {
  refundSeatedPlayers()
    .catch((err) => console.error('Iade sirasinda hata:', err))
    .finally(() => process.exit(0));
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

db.init()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`LOOTIV sunucusu ${PORT} portunda çalışıyor`);
    });
  })
  .catch((err) => {
    writeStartupLog('Veritabani baslatilamadi', err);
    process.exit(1);
  });
