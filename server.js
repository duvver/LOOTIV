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
const { TurkPokerTable } = require('./lib/turkPokerTable');
const { OkeyTable } = require('./lib/okeyTable');
const { Okey101Table } = require('./lib/okey101Table');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const RUMUZ_RE = /^[a-zA-Z0-9_]{3,20}$/;

global.botTestMode = true;
global.botTestCount = 500;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function asyncHandler(fn) {
  return (req, res, next) => fn(req, res, next).catch(next);
}

function generateCode() {
  return String(crypto.randomInt(100000, 999999));
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
// Avatar (profil resmi) data-URL olarak gonderilebildigi icin limit yukseltildi.
app.use(express.urlencoded({ extended: false, limit: '3mb' }));
app.use(express.json({ limit: '3mb' }));
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
  res.locals.unreadCount = 0;
  res.locals.pendingFriendCount = 0;
  if (req.session.userId) {
    await db.syncVip(req.session.userId).catch(() => {});
    const user = await db.getUserById(req.session.userId);
    if (user) {
      req.user = user;
      res.locals.unreadCount = await db
        .getUnreadAnnouncementCount(user.id, user.last_seen_announcement_id)
        .catch(() => 0);
      res.locals.pendingFriendCount = await db
        .getPendingFriendRequestCount(user.id)
        .catch(() => 0);
    } else {
      req.session.userId = null;
    }
  }
  next();
});

const requireAuth = (req, res, next) => {
  if (!req.user) return res.redirect('/giris');
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
    let scratchCountToday = 0;
    let announcements = [];
    let friends = [];
    let dailyTasks = [];
    let userDailyTasks = {};
    if (req.user) {
      if (dailyQuestion && dailyQuestion.active) {
        dailyAnswer = await db.getUserDailyAnswer(req.user.id, dailyQuestion.version);
      }
      if (scratchConfig && scratchConfig.active) {
        scratchCountToday = await db.getUserScratchCountToday(req.user.id);
      }
      announcements = await db.getAnnouncements(4).catch(() => []);
      friends = await db.getFriends(req.user.id).catch(() => []);
      
      dailyTasks = await db.getUserDailyTasks(req.user.id);
    }
    const vipLinks = await db.getVipLinks();
    const blogs = await db.getAllBlogs(5).catch(() => []);
    const gameStatuses = await db.getAllGameStatuses();

    res.render('lobby', {
      user: req.user || null,
      loginError,
      loginIdentifier,
      dailyQuestion,
      dailyAnswer,
      scratchConfig,
      scratchCountToday,
      announcements,
      friends,
      dailyTasks,
      userDailyTasks,
      vipPlans: db.getVipPlans(),
      vipLinks,
      blogs,
      gameStatuses,
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
      return res.redirect('/giris');
    }

    if (user.is_banned) {
      req.session.loginError = user.ban_reason
        ? `Hesabiniz yasaklandi: ${user.ban_reason}`
        : 'Hesabiniz yasaklandi.';
      req.session.loginIdentifier = identifier || '';
      return res.redirect('/giris');
    }

    req.session.userId = user.id;
    res.redirect('/');
  })
);

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// ---- Giris sayfasi (misafirler icin) ----

app.get('/vip', attachUser, (req, res) => {
  res.render('vip', {
    user: req.user || null,
    path: '/vip',
    _pendingFriends: res.locals._pendingFriends || 0
  });
});

app.get('/giris', requireGuest, (req, res) => {
  const loginError = req.session.loginError || null;
  const loginIdentifier = req.session.loginIdentifier || '';
  delete req.session.loginError;
  delete req.session.loginIdentifier;
  res.render('giris', { loginError, loginIdentifier });
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
    // Yeni uye once karakterini secsin.
    res.redirect('/karakter-sec');
  })
);

// ================= Kazı Kazan =================
app.get(
  '/kazikazan',
  attachUser,
  requireAuth,
  asyncHandler(async (req, res) => {
    const scratchConfig = await db.getScratchConfig();
    if (!scratchConfig || !scratchConfig.active) {
      return res.redirect('/');
    }
    const scratchCountToday = await db.getUserScratchCountToday(req.user.id);
    res.render('kazikazan', {
      user: req.user,
      scratchConfig,
      scratchCountToday,
    });
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
app.get(
  '/kazikazan',
  attachUser,
  requireAuth,
  asyncHandler(async (req, res) => {
    const config = await db.getScratchConfig();
    if (!config || !config.active) return res.redirect('/');
    
    const count = await db.getUserScratchCountToday(req.user.id);
    const limitReached = count >= config.daily_limit;

    res.render('kazikazan', { 
      config, 
      count, 
      limitReached,
      meta: { title: 'Kazı Kazan' }
    });
  })
);

app.post(
  '/kazikazan/oyna',
  attachUser,
  requireAuth,
  asyncHandler(async (req, res) => {
    const config = await db.getScratchConfig();
    if (!config || !config.active) {
      return res.json({ success: false, message: 'Kazı kazan şu anda aktif değil.' });
    }

    const count = await db.getUserScratchCountToday(req.user.id);
    if (count >= config.daily_limit) {
      return res.json({ success: false, message: 'Günlük oynama limitine ulaştınız.' });
    }

    const user = await db.getUserById(req.user.id);
    if (user.lt_balance < config.entry_fee) {
      return res.json({ success: false, message: 'Yetersiz LT bakiyesi.' });
    }

    // Sonucu belirle (playScratch sadece DB kaydı yapar)
    const prizes = (config.prizes || '0')
      .split(',')
      .map((p) => Number(p.trim()))
      .filter((n) => Number.isFinite(n));
    
    const prize = prizes.length ? prizes[Math.floor(Math.random() * prizes.length)] : 0;

    // Ücreti kes ve ödülü ekle
    await db.adjustLt(req.user.id, prize - config.entry_fee);

    // Günlük görevi ilerlet (Kazı Kazan oynama)
    await db.incrementUserTaskProgress(req.user.id, 'play_scratchcard', 1);
    
    await db.playScratch(req.user.id, prize);
    
    // 6 öğe oluştur. Eğer kazandıysa 3'ü prize, diğerleri farklı/rastgele.
    let items = [];
    if (prize > 0) {
      items = [prize, prize, prize];
      // Kalan 3 öğe kazanmayan ödüllerden olsun
      let otherPrizes = prizes.filter(p => p !== prize && p > 0);
      if(otherPrizes.length === 0) otherPrizes = [0, 10, 20];
      for(let i=0; i<3; i++) {
        items.push(otherPrizes[Math.floor(Math.random() * otherPrizes.length)]);
      }
    } else {
      // Kaybettiyse en fazla 2 tane aynı ödül olabilir. Kolaylık için hepsini rastgele farklı verelim
      let possible = prizes.filter(p => p > 0);
      if(possible.length < 6) possible = [10, 20, 50, 100, 250, 500];
      // Karıştır ve 6 tane al
      possible = possible.sort(() => 0.5 - Math.random());
      for(let i=0; i<6; i++) {
        items.push(possible[i % possible.length]); // Eğer possible boyutu azsa döne döne ama yine de hepsi aynı olmaz
      }
      // Hepsini karıştırıp tekrar dağıtalım ki 3 tane aynı olmasın (Zaten possible'ı farklı elemanlardan kurduk)
    }
    
    // Shuffle items array
    items = items.sort(() => 0.5 - Math.random());

    const newBalance = user.lt_balance - config.entry_fee + prize;

    res.json({ success: true, prize, items, newBalance });
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

// ================= Karakter secimi =================
const CHARACTERS = [
  { slug: 'savasci', name: 'Savasci', icon: '&#9876;', desc: 'Yakin dovus ustasi, dayanikli ve guclu.' },
  { slug: 'rahip', name: 'Rahip', icon: '&#10015;', desc: 'Iyilestirme ve destek buyulerinde uzman.' },
  { slug: 'sura', name: 'Sura', icon: '&#128481;', desc: 'Hizli ve cevik, iki elinde de silah tasir.' },
  { slug: 'ninja', name: 'Ninja', icon: '&#127885;', desc: 'Golgelerde saklanan sessiz suikastci.' },
];

app.get(
  '/karakter-sec',
  attachUser,
  asyncHandler(async (req, res) => {
    res.redirect('/?construction=Karakter');
  })
);

app.post(
  '/karakter-sec',
  attachUser,
  requireAuth,
  asyncHandler(async (req, res) => {
    const cls = (req.body.character || '').trim();
    const ok = await db.setCharacterClass(req.user.id, cls);
    if (!ok) {
      return res.render('karakter-sec', {
        user: req.user,
        characters: CHARACTERS,
        error: 'Lutfen gecerli bir karakter sec.',
      });
    }
    res.redirect('/');
  })
);

// ================= Profil resmi (avatar) =================
app.post(
  '/settings/profile/avatar',
  attachUser,
  requireAuth,
  asyncHandler(async (req, res) => {
    const raw = (req.body.avatar_url || '').trim();
    // Guvenlik: sadece http(s) veya makul boyutta bir data:image URL'sine izin ver.
    let value = null;
    if (raw) {
      const isHttp = /^https?:\/\/.+/i.test(raw);
      const isDataImg = /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(raw);
      if ((isHttp || isDataImg) && raw.length <= 2 * 1024 * 1024) {
        value = raw;
      }
    }
    await db.setAvatar(req.user.id, value);
    res.redirect('/settings/profile');
  })
);

// ================= VIP Kodu Kullanimi =================
app.post(
  '/settings/profile/vip',
  attachUser,
  requireAuth,
  asyncHandler(async (req, res) => {
    const code = (req.body.vip_code || '').trim();
    if (!code) {
      return renderProfileSettings(req, res, { error: 'Lütfen bir VIP kodu girin.' });
    }
    const tier = await db.redeemVipCode(req.user.id, code);
    if (!tier) {
      return renderProfileSettings(req, res, { error: 'Geçersiz veya kullanılmış VIP kodu.' });
    }
    const tierName = tier === 1 ? 'Bronz Paket' : tier === 2 ? 'Gümüş Paket' : tier === 3 ? 'Altın Paket' : `VIP${tier}`;
    await renderProfileSettings(req, res, { info: `Tebrikler! ${tierName} aktif edildi.` });
  })
);

// ================= Bloglar =================
app.get(
  '/bloglar',
  attachUser,
  asyncHandler(async (req, res) => {
    const blogs = await db.getAllBlogs(60);
    const myBlogs = req.user ? await db.getBlogsByUser(req.user.id) : [];
    res.render('bloglar', { user: req.user || null, blogs, myBlogs, saved: req.query.saved || null });
  })
);

app.get(
  '/bloglar/yeni',
  attachUser,
  requireAuth,
  (req, res) => {
    res.render('blog-form', { user: req.user, blog: null, error: null });
  }
);

app.post(
  '/bloglar/yeni',
  attachUser,
  requireAuth,
  asyncHandler(async (req, res) => {
    const title = (req.body.title || '').trim();
    const content = (req.body.content || '').trim();
    if (!title || !content) {
      return res.render('blog-form', { user: req.user, blog: null, error: 'Baslik ve icerik zorunlu.' });
    }
    await db.createBlog(req.user.id, req.user.rumuz, title.slice(0, 150), content.slice(0, 20000));
    res.redirect('/bloglar?saved=1');
  })
);

app.get(
  '/bloglar/:id',
  attachUser,
  asyncHandler(async (req, res) => {
    const blog = await db.getBlogById(Number(req.params.id));
    if (!blog) return res.redirect('/bloglar');
    res.render('blog-detay', { user: req.user || null, blog });
  })
);

app.get(
  '/bloglar/:id/duzenle',
  attachUser,
  requireAuth,
  asyncHandler(async (req, res) => {
    const blog = await db.getBlogById(Number(req.params.id));
    if (!blog || blog.user_id !== req.user.id) return res.redirect('/bloglar');
    res.render('blog-form', { user: req.user, blog, error: null });
  })
);

app.post(
  '/bloglar/:id/duzenle',
  attachUser,
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const blog = await db.getBlogById(id);
    if (!blog || blog.user_id !== req.user.id) return res.redirect('/bloglar');
    const title = (req.body.title || '').trim();
    const content = (req.body.content || '').trim();
    if (!title || !content) {
      return res.render('blog-form', { user: req.user, blog, error: 'Baslik ve icerik zorunlu.' });
    }
    await db.updateBlog(id, req.user.id, title.slice(0, 150), content.slice(0, 20000));
    res.redirect('/bloglar/' + id);
  })
);

app.post(
  '/bloglar/:id/sil',
  attachUser,
  requireAuth,
  asyncHandler(async (req, res) => {
    await db.deleteBlog(Number(req.params.id), req.user.id, !!req.user.is_admin);
    res.redirect('/bloglar');
  })
);

// ================= Arkadaslar =================
app.get(
  '/arkadaslar',
  attachUser,
  requireAuth,
  asyncHandler(async (req, res) => {
    const friends = await db.getFriends(req.user.id);
    const requests = await db.getIncomingRequests(req.user.id);
    res.render('arkadaslar', {
      user: req.user,
      friends,
      requests,
      info: req.query.info || null,
      error: req.query.error || null,
    });
  })
);

app.post(
  '/arkadaslar/istek',
  attachUser,
  requireAuth,
  asyncHandler(async (req, res) => {
    const rumuz = (req.body.rumuz || '').trim();
    if (!rumuz) return res.redirect('/arkadaslar?error=' + encodeURIComponent('Rumuz girin.'));
    const target = await db.getUserByRumuz(rumuz);
    if (!target) return res.redirect('/arkadaslar?error=' + encodeURIComponent('Boyle bir kullanici yok.'));
    const result = await db.sendFriendRequest(req.user.id, target.id);
    if (result.error) return res.redirect('/arkadaslar?error=' + encodeURIComponent(result.error));
    res.redirect('/arkadaslar?info=' + encodeURIComponent('Arkadaslik istegi gonderildi.'));
  })
);

app.post(
  '/arkadaslar/:id/kabul',
  attachUser,
  requireAuth,
  asyncHandler(async (req, res) => {
    await db.acceptFriendRequest(Number(req.params.id), req.user.id);
    res.redirect('/arkadaslar');
  })
);

app.post(
  '/arkadaslar/:id/sil',
  attachUser,
  requireAuth,
  asyncHandler(async (req, res) => {
    await db.removeFriendship(Number(req.params.id), req.user.id);
    res.redirect('/arkadaslar');
  })
);

// ================= Duyurular =================
app.get(
  '/duyurular',
  attachUser,
  asyncHandler(async (req, res) => {
    const announcements = await db.getAnnouncements(50);
    if (req.user) {
      await db.markAnnouncementsSeen(req.user.id);
      res.locals.unreadCount = 0; // bu sayfada okundu sayildi
    }
    res.render('duyurular', { user: req.user || null, announcements, saved: req.query.saved || null });
  })
);

app.post(
  '/duyurular',
  attachUser,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const title = (req.body.title || '').trim();
    const content = (req.body.content || '').trim();
    if (!title || !content) return res.redirect('/duyurular');
    const saved = await db.createAnnouncement(req.user.id, req.user.rumuz, title.slice(0, 150), content.slice(0, 5000));
    // Herkese aninda bildirim gonder (baglantida olan tum ekranlara).
    io.emit('announcement:new', {
      id: saved.id,
      title: saved.title,
      content: saved.content,
      admin: saved.admin_rumuz,
      created_at: saved.created_at,
    });
    res.redirect('/duyurular?saved=1');
  })
);

app.post(
  '/duyurular/:id/sil',
  attachUser,
  requireAdmin,
  asyncHandler(async (req, res) => {
    await db.deleteAnnouncement(Number(req.params.id));
    res.redirect('/duyurular?info=' + encodeURIComponent('Duyuru silindi.'));
  })
);

// ================= Pazar (LT ile alim/satim) =================
app.get(
  '/pazar',
  attachUser,
  asyncHandler(async (req, res) => {
    res.redirect('/?construction=Pazar');
  })
);

// Pazar icinde ilan olusturma: envanterden esya sec + fiyat + sure (envantere yonlendirmeden).
app.get(
  '/pazar/ilan',
  attachUser,
  requireAuth,
  asyncHandler(async (req, res) => {
    const all = await db.getUserInventory(req.user.id);
    const items = all.filter(function (i) { return !i.listed; });
    const cfg = await db.getMarketConfig();
    res.render('ilan-olustur', {
      user: req.user,
      items,
      commission: cfg.commission_percent,
      error: req.query.error || null,
    });
  })
);

app.post(
  '/pazar/ilan',
  attachUser,
  requireAuth,
  asyncHandler(async (req, res) => {
    const invId = Number(req.body.invId);
    const priceLt = Math.trunc(Number(req.body.price));
    const allowedDur = { '24': 24, '48': 48, '168': 168 };
    const durationHours = allowedDur[String(req.body.duration)] || 48;
    const item = invId ? await db.getInventoryItem(invId) : null;
    if (!item || item.user_id !== req.user.id) {
      return res.redirect('/pazar/ilan?error=' + encodeURIComponent('Lutfen envanterinden gecerli bir esya sec.'));
    }
    if (!Number.isFinite(priceLt) || priceLt <= 0 || priceLt > 2147483647) {
      return res.redirect('/pazar/ilan?error=' + encodeURIComponent('Gecerli bir fiyat gir (0dan buyuk ve en fazla 2,147,483,647).'));
    }
    const result = await db.createListingFromInventory({
      invId,
      userId: req.user.id,
      sellerRumuz: req.user.rumuz,
      priceLt,
      durationHours,
    });
    if (result.error) return res.redirect('/pazar/ilan?error=' + encodeURIComponent(result.error));
    res.redirect('/pazar?info=' + encodeURIComponent('Ilanin yayinlandi.'));
  })
);

// Envanter: kullanicinin sahip oldugu esyalar; buradan satisa koyar.
app.get(
  '/envanter',
  attachUser,
  asyncHandler(async (req, res) => {
    res.redirect('/?construction=Envanter');
  })
);

app.post(
  '/envanter/upgrade/:invId',
  attachUser,
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await db.upgradeInventoryItem(Number(req.params.invId), req.user.id);
    if (result.error) {
      return res.redirect('/envanter?error=' + encodeURIComponent(result.error));
    }
    res.redirect('/envanter?info=' + encodeURIComponent('Esya basariyla +' + result.newLevel + ' seviyesine yukseltildi!'));
  })
);

// Envanterdeki bir esyayi satisa koyma formu (sadece fiyat).
app.get(
  '/pazar/sat/:invId',
  attachUser,
  requireAuth,
  asyncHandler(async (req, res) => {
    const item = await db.getInventoryItem(Number(req.params.invId));
    if (!item || item.user_id !== req.user.id) return res.redirect('/envanter');
    if (item.listed) return res.redirect('/envanter?error=' + encodeURIComponent('Bu esya zaten satista.'));
    const cfg = await db.getMarketConfig();
    res.render('pazar-sat', { user: req.user, item, commission: cfg.commission_percent, error: null });
  })
);

app.post(
  '/pazar/sat/:invId',
  attachUser,
  requireAuth,
  asyncHandler(async (req, res) => {
    const invId = Number(req.params.invId);
    const priceLt = Math.trunc(Number(req.body.price));
    const item = await db.getInventoryItem(invId);
    if (!item || item.user_id !== req.user.id) return res.redirect('/envanter');
    if (!Number.isFinite(priceLt) || priceLt <= 0 || priceLt > 2147483647) {
      const cfg = await db.getMarketConfig();
      return res.render('pazar-sat', { user: req.user, item, commission: cfg.commission_percent, error: 'Gecerli bir fiyat gir (0dan buyuk ve en fazla 2,147,483,647).' });
    }
    const result = await db.createListingFromInventory({
      invId,
      userId: req.user.id,
      sellerRumuz: req.user.rumuz,
      priceLt,
    });
    if (result.error) return res.redirect('/envanter?error=' + encodeURIComponent(result.error));
    res.redirect('/pazar?info=' + encodeURIComponent('Ilanin yayinlandi.'));
  })
);

app.post(
  '/pazar/:id/satinal',
  attachUser,
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await db.buyListing(Number(req.params.id), req.user.id);
    if (result.error) return res.redirect('/pazar?error=' + encodeURIComponent(result.error));
    res.redirect('/pazar?info=' + encodeURIComponent(`"${result.title}" satin alindi (-${result.price} LT). Envanterine eklendi.`));
  })
);

app.post(
  '/pazar/:id/iptal',
  attachUser,
  requireAuth,
  asyncHandler(async (req, res) => {
    await db.cancelListing(Number(req.params.id), req.user.id);
    res.redirect('/pazar?info=' + encodeURIComponent('Ilan iptal edildi, esya envanterine geri dondu.'));
  })
);

// ================= Siralama (leaderboard) =================
app.get(
  '/siralama',
  attachUser,
  asyncHandler(async (req, res) => {
    const players = await db.getLeaderboard(50);
    res.render('siralama', { user: req.user || null, players });
  })
);

function requireRoomAccess(req, res, next) {
  const roomId = req.query.roomId;
  if (!roomId) return next();
  const room = activeUserRooms.get(roomId);
  if (!room || room.privacy !== 'private') return next();
  
  const unlocked = req.session.unlockedRooms || [];
  if (unlocked.includes(roomId)) {
    return next();
  }
  
  res.redirect(`/oyun/salon_${room.game}?error=private`);
}

// ---- Texas Hold'em odasi ----
app.get('/poker', attachUser, requireAuth, requireRoomAccess, (req, res) => {
  res.render('poker', { user: req.user });
});

// ---- Turk Pokeri odasi ----
app.get('/turkpoker', attachUser, requireAuth, requireRoomAccess, (req, res) => {
  res.render('turkpoker', { user: req.user });
});

// ---- Canak Okey odasi ----
app.get('/okey', attachUser, requireAuth, requireRoomAccess, (req, res) => {
  res.render('okey', { user: req.user });
});

// ---- 101 Okey odasi ----
app.get('/okey101', attachUser, requireAuth, requireRoomAccess, (req, res) => {
  res.render('okey101', { user: req.user });
});

// ---- Oyun salonu (bahis salonlari + masa listesi) ----
// Su an gorunum katmani; canli masa sistemi (backend) bir sonraki adimda baglanacak.
const GAME_META = {
  okey101: {
    slug: 'okey101',
    name: '101 Okey',
    icon: '&#128290;',
    accent: '#0f6e56',
    playUrl: '/okey101',
    desc: '21 tas, 101 acma, isleme ve ceza puanlariyla gercek 101 Okey.',
    rules: [
      { id: 'katlamali', label: 'Katlamalı Oyun', type: 'toggle', default: true }
    ],
    modes: [
      { id: 'solo', label: 'Tekli', default: true },
      { id: 'esli', label: 'Eşli', default: false }
    ],
    bets: [],
    howToPlay: [
      "Elinizdeki taşları seri veya çift yaparak toplamda en az 101 sayıya ulaşın.",
      "Yere açılan serilere taş işleyebilir veya bitmek için tüm taşlarınızı per yapabilirsiniz.",
      "Oyun sonunda elinde en az sayı kalan oyuncu eli kazanır."
    ]
  },
  okey: {
    slug: 'okey',
    name: 'Canak Okey',
    icon: '&#127922;',
    accent: '#993556',
    playUrl: '/okey',
    desc: '4 kisilik masada gosterge ve okey ile klasik okey.',
    rules: [
      { id: 'gosterge', label: 'Gösterge Aktif', type: 'toggle', default: true },
      { id: 'renkli', label: 'Renkli Bitiş', type: 'toggle', default: false },
      { id: 'robon', label: 'Röbon', type: 'toggle', default: false }
    ],
    modes: [
      { id: 'solo', label: 'Solo (Bireysel)', default: true },
      { id: 'esli', label: 'Eşli (Takım)', default: false }
    ],
    bets: [
      { id: '500', label: 'Başlangıç', amount: '500 G', value: 500 },
      { id: '2500', label: 'Orta', amount: '2.5K G', value: 2500 },
      { id: '10000', label: 'Pro', amount: '10K G', value: 10000 },
      { id: '50000', label: 'Elit', amount: '50K G', value: 50000 }
    ],
    howToPlay: [
      "Taşları aynı renkten sıralı veya farklı renkten aynı sayılar olacak şekilde en az 3'lü perler yapın.",
      "Okey taşı, joker yerine geçer. Göstergeyi ilk elde belli edip ekstra puan alabilirsiniz.",
      "Tüm taşlarınızı per yaptığınızda artan son taşı ortaya atarak bitin."
    ]
  },
  poker: {
    slug: 'poker',
    name: 'Texas Hold\'em',
    icon: '&#127183;',
    accent: '#353b99',
    playUrl: '/poker',
    desc: '',
    rules: [
      { id: 'hizli', label: 'Hızlı Oyun', type: 'toggle', default: false }
    ],
    modes: [
      { id: 'solo', label: 'Standart', default: true }
    ],
    bets: [
      { id: '500', label: 'Başlangıç', amount: '500 G', value: 500 },
      { id: '2500', label: 'Orta', amount: '2.5K G', value: 2500 },
      { id: '10000', label: 'Pro', amount: '10K G', value: 10000 },
      { id: '50000', label: 'Elit', amount: '50K G', value: 50000 }
    ],
    howToPlay: [
      "Her oyuncuya 2 kapalı kart dağıtılır. Ortaya 5 ortak kart açılır.",
      "Oyun ilerledikçe ortak kartlar (Flop, Turn, River) sırayla açılır ve bahis yapılır.",
      "En iyi 5 kartlık kombinasyonu (kendi kartlarınız + ortak kartlar) yapan potu kazanır."
    ]
  },
  turkpoker: {
    slug: 'turkpoker',
    name: 'Türk Pokeri',
    icon: '&#127183;',
    accent: '#353b99',
    playUrl: '/turkpoker',
    desc: '',
    rules: [
      { id: 'hizli', label: 'Hızlı Oyun', type: 'toggle', default: false }
    ],
    modes: [
      { id: 'solo', label: 'Standart', default: true }
    ],
    bets: [
      { id: '500', label: 'Başlangıç', amount: '500 G', value: 500 },
      { id: '2500', label: 'Orta', amount: '2.5K G', value: 2500 },
      { id: '10000', label: 'Pro', amount: '10K G', value: 10000 },
      { id: '50000', label: 'Elit', amount: '50K G', value: 50000 }
    ],
    howToPlay: [
      "Her oyuncuya 5 kapalı kart dağıtılır. İlk bahis turu (Kör Bahis) yapılır.",
      "Oyuncular ellerine uymayan 0-4 arası kartı değiştirme hakkına (Draw) sahiptir.",
      "Kart değişiminden sonra ikinci bahis turu yapılır. En iyi eli yapan kazanır. (Sıralama: Renk > Ful)"
    ]
  },
};

// Bahis salonlari kaldirildi. Masa min. LT'sini kullanici serbest belirler.
app.get('/oyun/:oyun', attachUser, requireAuth, asyncHandler(async (req, res) => {
  const meta = GAME_META[req.params.oyun];
  if (!meta) return res.redirect('/');
  const gameStatuses = await db.getAllGameStatuses();
  if (gameStatuses[meta.slug] === false) return res.redirect('/');
  res.render('salon', { user: req.user, meta });
}));

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
    const catalogItems = await db.getCatalogItems();
    const activeListings = await db.getAllActiveListings(200);
    const marketConfig = await db.getMarketConfig();
    const dailyTasks = await db.getDailyTasks(true);
    const vipCodes = await db.getAllVipCodes();
    const vipLinks = await db.getVipLinks();
    const whitelistStats = await db.getWhitelistStats();
    const whitelistLogs = await db.getWhitelistLogs(100);
    const commissionSettings = await db.getAllCommissionSettings();
    const treasuryBalance = await db.getCommissionBalance();
    const withdrawalHistory = await db.getWithdrawalHistory(50);
    const pokerConfig = await db.getPokerConfig();
    const gameStatuses = await db.getAllGameStatuses();
    const gameMeta = GAME_META; // Pass GAME_META to know which games exist

    res.render('admin', {
      user: req.user,
      users,
      stats,
      gameLogs,
      dailyQuestion,
      scratchConfig,
      catalogItems,
      activeListings,
      marketConfig,
      dailyTasks,
      vipCodes,
      vipLinks,
      whitelistStats,
      whitelistLogs,
      commissionSettings,
      treasuryBalance,
      withdrawalHistory,
      categories: db.MARKET_CATEGORIES,
      rarities: db.MARKET_RARITIES,
      vipPlans: db.getVipPlans(),
      pokerConfig,
      gameStatuses,
      gameMeta,
      botTestMode: global.botTestMode,
      botTestCount: global.botTestCount,
      savedMsg: req.query.saved || null,
    });
  })
);

app.post(
  '/admin/bot-test',
  attachUser,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { botCount } = req.body;
    const count = parseInt(botCount, 10);
    
    if (isNaN(count)) {
      global.botTestMode = false;
      global.botTestCount = 0;
    } else if (count <= 0) {
      global.botTestMode = false;
      global.botTestCount = 0;
    } else {
      global.botTestMode = true;
      global.botTestCount = Math.min(count, 2000); // 2000'e kadar sinir
    }
    
    broadcastLobbyPlayers().catch(err => console.error(err));
    res.redirect('/admin');
  })
);

app.post(
  '/admin/game-status',
  attachUser,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { slug, is_active } = req.body;
    if (!GAME_META[slug]) return res.redirect('/admin?error=Geçersiz oyun');
    await db.setGameStatus(slug, is_active === 'true');
    res.redirect('/admin?saved=Oyun durumu güncellendi');
  })
);
app.post(
  '/admin/poker-config',
  attachUser,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const tableCount = parseInt(req.body.table_count, 10);
    if (!isNaN(tableCount) && tableCount > 0) {
      await db.upsertPokerConfig(tableCount);
      await reinitSystemPokerRooms(tableCount);
    }
    res.redirect('/admin?saved=poker#poker');
  })
);

// ---- Whitelist / Erken Erisim Olay Kaydi (AJAX) ----
app.post(
  '/api/whitelist/event',
  attachUser,
  asyncHandler(async (req, res) => {
    const feature = (req.body.feature || 'Bilinmeyen').trim();
    const eventType = (req.body.eventType || 'view').trim(); // 'view' or 'click'
    const userId = req.user ? req.user.id : null;
    const rumuz = req.user ? req.user.rumuz : 'Ziyaretçi';
    
    await db.logWhitelistEvent({ userId, rumuz, feature, eventType });
    res.json({ ok: true });
  })
);

app.post(
  '/admin/whitelist/logs/:id/delete',
  attachUser,
  requireAdmin,
  asyncHandler(async (req, res) => {
    await db.deleteWhitelistLog(Number(req.params.id));
    res.redirect('/admin?tab=whitelist');
  })
);

app.post(
  '/admin/whitelist/logs/clear',
  attachUser,
  requireAdmin,
  asyncHandler(async (req, res) => {
    await db.clearAllWhitelistLogs();
    res.redirect('/admin?tab=whitelist');
  })
);

app.post(
  '/admin/users/:id/mute',
  attachUser,
  requireAdmin,
  asyncHandler(async (req, res) => {
    await db.toggleMute(Number(req.params.id));
    res.redirect('/admin?tab=users#users');
  })
);

app.post(
  '/admin/users/:id/admin',
  attachUser,
  requireAdmin,
  asyncHandler(async (req, res) => {
    await db.toggleAdmin(Number(req.params.id));
    res.redirect('/admin?tab=users#users');
  })
);

app.post(
  '/admin/users/:id/ban',
  attachUser,
  requireAdmin,
  asyncHandler(async (req, res) => {
    await db.toggleBan(Number(req.params.id), req.body.reason);
    res.redirect('/admin?tab=users#users');
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
    res.redirect('/admin?tab=users#users');
  })
);

app.post(
  '/admin/users/:id/vip',
  attachUser,
  requireAdmin,
  asyncHandler(async (req, res) => {
    await db.setVip(Number(req.params.id), Number(req.body.tier));
    res.redirect('/admin?tab=vip#vip');
  })
);

app.post(
  '/admin/vip-codes/generate',
  attachUser,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const tier = Number(req.body.tier);
    const count = Number(req.body.count) || 1;
    const platform = (req.body.platform || 'genel').trim();
    if (tier >= 1 && tier <= 3 && count > 0 && count <= 50) {
      await db.generateVipCodes(tier, count, platform);
    }
    res.redirect('/admin?tab=epin#epin');
  })
);

// ---- VIP Kodlari TXT olarak disa aktar ----
app.get(
  '/admin/vip-codes/export',
  attachUser,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const allCodes = await db.getAllVipCodes();
    const filterPlatform = (req.query.platform || '').trim().toLowerCase();
    const filterStatus = (req.query.status || '').trim(); // 'active' | 'used' | '' (all)

    let codes = allCodes;
    if (filterPlatform && filterPlatform !== 'all') {
      codes = codes.filter(c => (c.platform || 'genel').toLowerCase() === filterPlatform);
    }
    if (filterStatus === 'active') {
      codes = codes.filter(c => !c.is_used);
    } else if (filterStatus === 'used') {
      codes = codes.filter(c => c.is_used);
    }

    const lines = [];
    lines.push('=== LOOTIV VIP E-Pin Kodlari ===');
    lines.push('Tarih: ' + new Date().toLocaleString('tr-TR'));
    if (filterPlatform && filterPlatform !== 'all') lines.push('Platform: ' + filterPlatform);
    if (filterStatus) lines.push('Durum: ' + (filterStatus === 'active' ? 'Aktif' : 'Kullanildi'));
    lines.push('Toplam: ' + codes.length + ' adet');
    lines.push('================================');
    lines.push('');

    codes.forEach(c => {
      const status = c.is_used ? 'KULLANILDI' : 'AKTIF';
      const plat = (c.platform || 'genel').toUpperCase();
      const tierName = c.tier === 1 ? 'Bronz Paket' : c.tier === 2 ? 'Gümüş Paket' : c.tier === 3 ? 'Altın Paket' : ('VIP ' + c.tier);
      lines.push(c.code + '  |  ' + tierName + '  |  ' + plat + '  |  ' + status);
    });

    const filename = 'lootiv-epinler-' + new Date().toISOString().slice(0, 10) + '.txt';
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');
    res.send(lines.join('\r\n'));
  })
);

app.post(
  '/admin/vip-codes/delete',
  attachUser,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const code = req.body.code;
    if (code) {
      await db.deleteVipCode(code);
    }
    res.redirect('/admin?tab=epin#epin');
  })
);

app.post(
  '/admin/vip-links/add',
  attachUser,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const name = (req.body.name || '').trim();
    const url = (req.body.url || '').trim();
    if (name && url) {
      await db.addVipLink(name, url);
    }
    res.redirect('/admin?tab=epin#epin');
  })
);

app.post(
  '/admin/vip-links/delete',
  attachUser,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = Number(req.body.id);
    if (id) {
      await db.deleteVipLink(id);
    }
    res.redirect('/admin?tab=epin#epin');
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
    res.redirect('/admin?saved=gunun-sorusu#dailyq');
  })
);

app.post(
  '/admin/kazikazan',
  attachUser,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { prizes, entry_fee, daily_limit, active } = req.body;
    const cleanedPrizes = (prizes || '')
      .split(',')
      .map((p) => p.trim())
      .filter((p) => p !== '' && Number.isFinite(Number(p)))
      .join(',');
    await db.upsertScratchConfig({
      prizes: cleanedPrizes || '0',
      entry_fee: Number(entry_fee) || 50,
      daily_limit: Number(daily_limit) || 1,
      active: active === 'on' || active === '1' || active === 'true',
    });
    res.redirect('/admin?saved=kazikazan#scratch');
  })
);

// ---- Admin: Günlük Görevler ----
app.post(
  '/admin/daily_tasks',
  attachUser,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { action_type, title, task_type, target_count, reward_lt, is_fixed, active, task_id } = req.body;
    
    if (action_type === 'delete') {
      await db.deleteDailyTask(task_id);
    } else if (action_type === 'edit') {
      await db.updateDailyTask(task_id, {
        title, task_type, 
        target_count: Number(target_count) || 1, 
        reward_lt: Number(reward_lt) || 0,
        is_fixed: is_fixed === 'on' || is_fixed === 'true',
        active: active === 'on' || active === 'true'
      });
    } else if (action_type === 'add') {
      await db.createDailyTask({
        title, task_type, 
        target_count: Number(target_count) || 1, 
        reward_lt: Number(reward_lt) || 0,
        is_fixed: is_fixed === 'on' || is_fixed === 'true',
        active: active === 'on' || active === 'true'
      });
    }
    res.redirect('/admin?saved=dailytasks#dailytasks');
  })
);

// ---- Admin: Pazar yonetimi ----
app.post(
  '/admin/market/item',
  attachUser,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const name = (req.body.name || '').trim();
    const category = (req.body.category || 'diger').trim();
    const rarity = (req.body.rarity || 'common').trim();
    let imageUrl = (req.body.image_url || '').trim();
    if (imageUrl && !/^https?:\/\/.+/i.test(imageUrl)) imageUrl = '';
    if (name) {
      await db.createCatalogItem({ name: name.slice(0, 120), category, rarity, imageUrl });
    }
    res.redirect('/admin?saved=market#market');
  })
);

app.post(
  '/admin/market/item/:id/sil',
  attachUser,
  requireAdmin,
  asyncHandler(async (req, res) => {
    await db.deleteCatalogItem(Number(req.params.id));
    res.redirect('/admin?saved=market#market');
  })
);

app.post(
  '/admin/market/grant',
  attachUser,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const rumuz = (req.body.rumuz || '').trim();
    const catalogId = Number(req.body.catalog_id);
    const target = rumuz ? await db.getUserByRumuz(rumuz) : null;
    const item = Number.isFinite(catalogId) ? await db.getCatalogItem(catalogId) : null;
    if (target && item) {
      await db.grantItemToUser(target.id, catalogId);
    }
    res.redirect('/admin?saved=market#market');
  })
);

app.post(
  '/admin/market/listing/:id/sil',
  attachUser,
  requireAdmin,
  asyncHandler(async (req, res) => {
    await db.adminRemoveListing(Number(req.params.id));
    res.redirect('/admin?saved=market#market');
  })
);

app.post(
  '/admin/market/commission',
  attachUser,
  requireAdmin,
  asyncHandler(async (req, res) => {
    await db.setCommission(req.body.commission);
    res.redirect('/admin?saved=market#market');
  })
);

app.post(
  '/admin/treasury/update-commission',
  attachUser,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { game, rate } = req.body;
    await db.setCommissionRate(game, Number(rate) / 100);
    res.redirect('/admin?saved=treasury#treasury');
  })
);

app.post(
  '/admin/treasury/transfer',
  attachUser,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { rumuz, amount, note } = req.body;
    const targetUser = await db.getUserByRumuz(rumuz);
    if (!targetUser) {
      return res.send('<script>alert("Kullanıcı bulunamadı!"); window.location.href="/admin?saved=treasury#treasury";</script>');
    }
    const numAmount = parseInt(amount, 10);
    if (isNaN(numAmount) || numAmount <= 0 || numAmount > 2147483647) {
      return res.send('<script>alert("Geçersiz miktar (en fazla 2,147,483,647)!"); window.location.href="/admin?saved=treasury#treasury";</script>');
    }
    await db.withdrawCommission(targetUser.id, numAmount, note);
    res.redirect('/admin?saved=treasury#treasury');
  })
);

// ---- API: Leaderboard, Recent Games, Online Users ----
app.get('/api/leaderboard/:game_slug', attachUser, asyncHandler(async (req, res) => {
  const game = req.params.game_slug;
  const leaderboard = await db.getPokerLeaderboard(game);
  res.json({ leaderboard });
}));

app.get('/api/users/online', attachUser, requireAuth, (req, res) => {
  const uniqueUsers = [];
  const seenIds = new Set();
  for (const p of onlinePlayers.values()) {
    if (p.userId && !seenIds.has(p.userId) && p.userId !== req.user.id) {
      seenIds.add(p.userId);
      uniqueUsers.push({ id: p.userId, username: p.name });
    }
  }
  res.json({ users: uniqueUsers });
});

app.get('/api/my/recent-games', attachUser, requireAuth, asyncHandler(async (req, res) => {
  const games = await db.getUserRecentGames(req.user.id, 10);
  res.json({ games });
}));

// ---- 500 hata sayfasi (asyncHandler'dan gelen hatalar) ----
app.use((err, req, res, next) => {
  writeStartupLog(`Route hatasi: ${req.method} ${req.originalUrl}`, err);
  res.status(500).send('Bir sunucu hatasi olustu.');
});

// ================= Socket.IO (Turk Pokeri + 101 Okey) =================
const onlinePlayers = new Map(); // socket.id -> { userId, name }
const CHANNELS = ['genel', 'oyun', 'okey', 'okey101', 'poker', 'turkpoker', 'sistem', 'salon_okey', 'salon_okey101', 'salon_poker', 'salon_turkpoker'];

function broadcastPlayers() {
  const uniqueByUser = new Map();
  for (const p of onlinePlayers.values()) uniqueByUser.set(p.userId, p.name);
  io.emit('poker:players', Array.from(uniqueByUser.values()));
  io.emit('turkpoker:players', Array.from(uniqueByUser.values()));
}

// Lobi sag panelindeki aktif kullanicilar + LT listesi.
async function broadcastLobbyPlayers() {
  const allPlayers = Array.from(onlinePlayers.values());
  const ids = Array.from(new Set(allPlayers.map((p) => p.userId)));

  // Emit player counts for the homepage and other listeners
  const stats = {
    total: ids.length,
    games: { okey: 0, okey101: 0, poker: 0, turkpoker: 0 }
  };
  const games = ['okey', 'okey101', 'poker', 'turkpoker'];
  for (const g of games) {
    stats.games[g] = new Set(allPlayers.filter(p => p.game === g || p.game === 'salon_' + g).map(p => p.userId)).size;
  }
  io.emit('lobby:stats', stats);

  if (ids.length === 0) {
    io.to('lobby').emit('lobby:players', []);
    return;
  }

  let fakeBotIds = [];
  if (global.botTestMode && global.botTestCount > 0) {
    for (let i = 1; i <= global.botTestCount; i++) {
      fakeBotIds.push(`bot_${i}`);
    }
  }

  let brief = [];
  try {
    const realIds = ids.filter(id => typeof id === 'number');
    if (realIds.length > 0) {
      brief = await db.getUsersBrief(realIds);
    }
  } catch (err) {
    brief = [];
  }
  const byId = new Map(brief.map((u) => [u.id, u]));

  const mapIds = (userList) => {
    return userList.map((id) => {
      if (typeof id === 'string' && id.startsWith('bot_')) {
        const botIndex = parseInt(id.split('_')[1], 10);
        return {
          rumuz: `Oyuncu_${botIndex}`,
          lt: 5000 + (botIndex * 100),
          avatar: null,
          vip: botIndex % 4,
          character: 'default'
        };
      }
      const u = byId.get(id);
      if (!u) return null;
      return {
        rumuz: u.rumuz,
        lt: u.lt_balance,
        avatar: u.avatar_url,
        vip: u.vip_tier,
        character: u.character_class,
      };
    }).filter(Boolean).sort((a, b) => b.lt - a.lt);
  };

  // Global lobby yayını
  let globalLobbyIds = [...ids];
  if (global.botTestMode) {
    globalLobbyIds = [...globalLobbyIds, ...fakeBotIds];
  }
  io.to('lobby').emit('lobby:players', mapIds(globalLobbyIds));

  // Oyun özel lobileri için yayın
  for (const g of games) {
    const gameUserIds = Array.from(new Set(
      allPlayers.filter(p => p.game === g || p.game === 'salon_' + g).map(p => p.userId)
    ));
    let combinedGameIds = [...gameUserIds];
    if (g === 'okey101' && global.botTestMode) {
      combinedGameIds = [...combinedGameIds, ...fakeBotIds];
    }
    const gameList = mapIds(combinedGameIds);
    io.to('salon_' + g).emit('lobby:players', gameList);
    io.to(g).emit('lobby:players', gameList);
  }
}

async function systemMessage(text, room = null) {
  const saved = await db.insertMessage({ userId: null, username: 'Sistem', channel: 'sistem', content: text });
  const payload = {
    channel: 'sistem',
    username: 'Sistem',
    content: text,
    created_at: saved.created_at,
  };
  if (room) {
    io.to(room).emit('chat:message', payload);
  } else {
    io.emit('chat:message', payload);
  }
}

async function gameLogMessage(text, channel = 'oyun', room = null) {
  const saved = await db.insertMessage({ userId: null, username: 'Masa', channel, content: text });
  const payload = {
    channel,
    username: 'Masa',
    content: text,
    created_at: saved.created_at,
  };
  if (room) {
    io.to(room).emit('chat:message', payload);
  } else {
    io.emit('chat:message', payload);
  }
}

const table = new PokerTable();
const turkPokerTable = new TurkPokerTable();
const pendingStandTimers = new Map();
const pendingStandTimersTurkPoker = new Map();
const RECONNECT_GRACE_MS = 8000;

table.on('log', (text) => gameLogMessage(text, 'oyun', 'poker').catch(console.error));
table.on('update', (state) => {
  io.to('poker').emit('table:state', state);
  io.to('salon_poker').emit('table:state', state);
});
table.on('animation', (payload) => {
  io.to('poker').emit('table:animation', payload);
  io.to('salon_poker').emit('table:animation', payload);
});
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
          game: 'poker',
        });
      } catch (err) {
        console.error('Oyun logu yazilamadi:', err);
      }
    }
  })();
});

turkPokerTable.on('log', (text) => gameLogMessage(text, 'oyun', 'turkpoker').catch(console.error));
turkPokerTable.on('update', (state) => {
  io.to('turkpoker').emit('turkpoker:state', state);
  io.to('salon_turkpoker').emit('turkpoker:state', state);
});
turkPokerTable.on('animation', (payload) => {
  io.to('turkpoker').emit('turkpoker:animation', payload);
  io.to('salon_turkpoker').emit('turkpoker:animation', payload);
});
turkPokerTable.on('private-cards', (payload) => {
  for (const { userId, cards } of payload) {
    for (const [, s] of io.sockets.sockets) {
      if (s.request.session && s.request.session.userId === userId) {
        s.emit('turkpoker:cards', cards);
      }
    }
  }
});
turkPokerTable.on('hand-result', ({ handNumber, participants }) => {
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
          game: 'turkpoker',
        });
      } catch (err) {
        console.error('Oyun logu yazilamadi:', err);
      }
    }
  })();
});

const okeyTable = new OkeyTable();
const pendingStandTimersOkey = new Map();

okeyTable.on('log', (text) => gameLogMessage(text, 'okey', 'okey').catch(console.error));
okeyTable.on('update', (state) => {
  io.to('okey').emit('okey:state', state);
  io.to('salon_okey').emit('okey:state', state);
});
okeyTable.on('private-tiles', (payload) => {
  for (const { userId, tiles } of payload) {
    for (const [, s] of io.sockets.sockets) {
      if (s.request.session && s.request.session.userId === userId) {
        s.emit('okey:tiles', tiles);
      }
    }
  }
});

okeyTable.on('hand-result', ({ handNumber, participants }) => {
  (async () => {
    for (const p of participants) {
      if (p.userId <= 0) continue; // bot (negatif id) icin log yazma
      try {
        const freshUser = await db.getUserById(p.userId);
        const totalSnapshot = freshUser ? freshUser.lt_balance : 0;
        const result = p.ltChange > 0 ? 'win' : 'lose';
        await db.logGameResult({
          userId: p.userId,
          rumuz: p.name,
          handNumber,
          playedLt: Math.abs(p.ltChange),
          result,
          ltChange: p.ltChange,
          totalLtSnapshot: totalSnapshot,
          game: 'okey',
        });
      } catch (err) {
        console.error('Okey oyun logu yazilamadi:', err);
      }
    }
  })();
});

// ---- 101 Okey masasi ----
const okey101Table = new Okey101Table();
const pendingStandTimers101 = new Map();

okey101Table.on('log', (text) => gameLogMessage(text, 'okey101', 'okey101').catch(console.error));
okey101Table.on('update', (state) => {
  io.to('okey101').emit('okey101:state', state);
  io.to('salon_okey101').emit('okey101:state', state);
});
okey101Table.on('private-tiles', (payload) => {
  for (const { userId, tiles } of payload) {
    for (const [, s] of io.sockets.sockets) {
      if (s.request.session && s.request.session.userId === userId) {
        s.emit('okey101:tiles', tiles);
      }
    }
  }
});

okey101Table.on('hand-result', ({ handNumber, participants }) => {
  (async () => {
    for (const p of participants) {
      if (p.userId <= 0) continue;
      try {
        const freshUser = await db.getUserById(p.userId);
        const totalSnapshot = freshUser ? freshUser.lt_balance : 0;
        const result = p.ltChange > 0 ? 'win' : p.ltChange < 0 ? 'lose' : 'berabere';
        await db.logGameResult({
          userId: p.userId,
          rumuz: p.name,
          handNumber,
          playedLt: Math.abs(p.ltChange),
          result,
          ltChange: p.ltChange,
          totalLtSnapshot: totalSnapshot,
          game: 'okey101',
        });
      } catch (err) {
        console.error('101 Okey oyun logu yazilamadi:', err);
      }
    }
  })();
});

// ---- Dynamic User Room Manager ----
let userRoomCounter = 1;
const activeUserRooms = new Map();

function getPublicRoomsList(gameSlug) {
  const rooms = [];
  for (const [id, r] of activeUserRooms.entries()) {
    if (r.game === gameSlug) {
      const seated = r.table.seats.filter(Boolean);
      rooms.push({
        id: r.id,
        game: r.game,
        title: r.title,
        stake: r.stake,
        mode: r.mode,
        privacy: r.privacy,
        creatorName: r.creatorName,
        gameMode: r.table.gameMode || 'Tek',
        gameType: r.table.gameType || 'Katlamasız',
        seatedCount: seated.length,
        seatCount: r.table.seats.length,
        seats: r.table.seats.map((s) => (s ? { name: s.name, isBot: !!s.isBot } : null)),
      });
    }
  }
  return rooms;
}

function broadcastUserRooms(gameSlug) {
  const rooms = getPublicRoomsList(gameSlug);
  io.to('salon_' + gameSlug).emit('rooms:list', rooms);
}

function checkUserRoomCleanup(roomId) {
  const room = activeUserRooms.get(roomId);
  if (!room) return;
  const humanCount = room.table.seats.filter((s) => s && !s.isBot).length;
  if (humanCount === 0) {
    try { room.table.resetTable(); } catch (e) {}
    activeUserRooms.delete(roomId);
    broadcastUserRooms(room.game);
  } else {
    broadcastUserRooms(room.game);
  }
}

function wireTableEvents(tableInstance, game, roomId) {
  tableInstance.on('log', (text) => gameLogMessage(text, 'oyun', game).catch(console.error));
  tableInstance.on('update', (state) => {
    io.to(roomId).emit(game + ':state', state);
    broadcastUserRooms(game);
  });

  if (game === 'okey101' || game === 'okey') {
    tableInstance.on('private-tiles', (payload) => {
      for (const { userId, tiles } of payload) {
        for (const [, s] of io.sockets.sockets) {
          if (s.request.session && s.request.session.userId === userId) {
            s.emit(game + ':tiles', tiles);
          }
        }
      }
    });
  } else if (game === 'poker' || game === 'turkpoker') {
    tableInstance.on('animation', (payload) => {
      io.to(roomId).emit(game + ':animation', payload);
    });
    tableInstance.on('private-cards', (payload) => {
      for (const { userId, cards } of payload) {
        for (const [, s] of io.sockets.sockets) {
          if (s.request.session && s.request.session.userId === userId) {
            s.emit(game + ':cards', cards);
          }
        }
      }
    });
    tableInstance.on('hand-result', ({ handNumber, participants }) => {
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
              game: game,
            });
          } catch (err) {
            console.error('Oda oyun logu yazilamadi:', err);
          }
        }
      })();
    });
  }
}

app.post('/api/rooms/create', attachUser, requireAuth, asyncHandler(async (req, res) => {
  const { game, bet, mode, privacy, password, title: customTitle, rules } = req.body;
  if (!game || !GAME_META[game]) {
    return res.status(400).json({ error: 'Geçersiz oyun.' });
  }

  if (game === 'poker' || game === 'turkpoker') {
    return res.status(400).json({ error: 'Bu oyunlar için yeni masa oluşturulamaz. Lütfen sistem masalarına katılın.' });
  }

  const isVip = req.user.vip_tier > 0;
  const parsedBet = Number(bet) || 500;
  const stake = (parsedBet <= 0 || parsedBet > 2147483647) ? 500 : parsedBet;
  const roomId = 'room_' + game + '_' + (userRoomCounter++);
  let title = `Masa #${userRoomCounter - 1}`;
  if (isVip && customTitle && typeof customTitle === 'string' && customTitle.trim()) {
    title = customTitle.trim().slice(0, 30);
  }

  let tableInstance;
  if (game === 'okey101') {
    tableInstance = new Okey101Table();
  } else if (game === 'okey') {
    tableInstance = new OkeyTable();
  } else if (game === 'turkpoker') {
    tableInstance = new TurkPokerTable();
  } else {
    tableInstance = new PokerTable();
  }
  tableInstance.stake = stake;

  const isEsli = mode === 'esli';
  tableInstance.gameMode = isEsli ? 'Eşli' : 'Tek';
  const isKatlamali = Array.isArray(rules) ? rules.includes('katlamali') : !!rules;
  tableInstance.isKatlamali = isKatlamali;
  tableInstance.gameType = isKatlamali ? 'Katlamalı' : 'Katlamasız';

  const roomObj = {
    id: roomId,
    game,
    title,
    stake,
    mode: mode || 'solo',
    privacy: privacy || 'public',
    password: password || '',
    creatorId: req.user.id,
    creatorName: req.user.rumuz,
    table: tableInstance,
    createdAt: Date.now(),
  };

  // Kurucuyu sunucuda hemen 0. koltuğa oturt
  await tableInstance.sit(req.user, 0);


  activeUserRooms.set(roomId, roomObj);

  wireTableEvents(tableInstance, game, roomId);

  broadcastUserRooms(game);

  const playUrl = GAME_META[game].playUrl + '?roomId=' + roomId + '&autoSit=true';
  res.json({ ok: true, roomId, playUrl });
}));

app.post('/api/rooms/verify-password', attachUser, requireAuth, asyncHandler(async (req, res) => {
  const { roomId, password } = req.body;
  const room = activeUserRooms.get(roomId);
  if (!room) {
    return res.status(404).json({ error: 'Masa bulunamadı veya kapanmış.' });
  }
  if (room.privacy === 'private' && room.password !== password) {
    return res.status(400).json({ error: 'Girdiğiniz oda şifresi hatalı!' });
  }
  
  req.session.unlockedRooms = req.session.unlockedRooms || [];
  if (!req.session.unlockedRooms.includes(roomId)) {
    req.session.unlockedRooms.push(roomId);
  }
  
  const playUrl = GAME_META[room.game].playUrl + '?roomId=' + roomId + '&autoSit=true';
  res.json({ ok: true, playUrl });
}));

async function handleGift(fromUserId, toUserId, amount) {
  if (fromUserId === toUserId) return { error: "Kendinize hediye gonderemezsiniz." };
  try {
    const fromUsers = await db.getUsersByIds([fromUserId]);
    const fromUser = fromUsers[0];
    if (!fromUser || fromUser.lt_balance < amount) return { error: "Yetersiz bakiye." };
    await db.updateUserBalance(-amount, fromUserId);
    await db.updateUserBalance(amount, toUserId);
    return { ok: true };
  } catch (err) {
    console.error('Gift error:', err);
    return { error: "Hediye gonderilirken bir hata olustu." };
  }
}

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
    const rawGame = socket.handshake.query.game;
    const reqRoomId = socket.handshake.query.roomId;

    const validGames = ['okey', 'okey101', 'poker', 'turkpoker', 'lobby', 'notify'];
    const validSalonGames = ['salon_okey', 'salon_okey101', 'salon_poker', 'salon_turkpoker'];
    let game = 'poker';
    if (validGames.includes(rawGame) || validSalonGames.includes(rawGame)) {
      game = rawGame;
    }
    socket.join(game);
    if (reqRoomId && activeUserRooms.has(reqRoomId)) {
      socket.join(reqRoomId);
    }

    // Bildirim soketi: sadece duyurulari dinler; oyuncu listesine/sohbete katilmaz.
    if (game === 'notify') return;

    onlinePlayers.set(socket.id, { userId: user.id, name, game });

    const pendingStand = pendingStandTimers.get(user.id);
    if (pendingStand) {
      clearTimeout(pendingStand);
      pendingStandTimers.delete(user.id);
    }
    const pendingStandTurkPoker = pendingStandTimersTurkPoker.get(user.id);
    if (pendingStandTurkPoker) {
      clearTimeout(pendingStandTurkPoker);
      pendingStandTimersTurkPoker.delete(user.id);
    }
    const pendingStandOkey = pendingStandTimersOkey.get(user.id);
    if (pendingStandOkey) {
      clearTimeout(pendingStandOkey);
      pendingStandTimersOkey.delete(user.id);
    }
    const pendingStand101 = pendingStandTimers101.get(user.id);
    if (pendingStand101) {
      clearTimeout(pendingStand101);
      pendingStandTimers101.delete(user.id);
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
    broadcastLobbyPlayers().catch(() => {});
    if (game !== 'lobby') {
      systemMessage(`${name} masaya katildi.`).catch(console.error);
    }

    if (game.startsWith('salon_')) {
      const gSlug = game.replace('salon_', '');
      socket.emit('rooms:list', getPublicRoomsList(gSlug));
    }

    socket.on('rooms:get', (gameSlug) => {
      const targetSlug = gameSlug || (game.startsWith('salon_') ? game.replace('salon_', '') : game);
      socket.emit('rooms:list', getPublicRoomsList(targetSlug));
    });

    const currentRoom = reqRoomId ? activeUserRooms.get(reqRoomId) : null;
    if (reqRoomId && !currentRoom) {
      const errorEvent = game === 'okey101' ? 'okey101:error' : 
                         game === 'okey' ? 'okey:error' : 
                         game === 'turkpoker' ? 'turkpoker:error' : 'table:error';
      const redirectUrl = game === 'okey101' ? '/oyun/okey101' :
                          game === 'okey' ? '/oyun/okey' :
                          game === 'turkpoker' ? '/oyun/turkpoker' : '/oyun/poker';
                          
      socket.emit(errorEvent, 'Oda bulunamadı veya kapatılmış. Lobiye yönlendiriliyorsunuz.');
      setTimeout(() => {
        socket.emit('redirect', redirectUrl);
      }, 1500);
      return;
    }
    const currentTable101 = currentRoom ? currentRoom.table : okey101Table;
    const currentTableOkey = currentRoom ? currentRoom.table : okeyTable;
    const currentTablePoker = currentRoom ? currentRoom.table : table;
    const currentTableTurkPoker = currentRoom ? currentRoom.table : turkPokerTable;

    if (game === 'poker') {
      socket.emit('table:state', currentTablePoker.getPublicState());
      const mySeat = currentTablePoker.seats.find((s) => s && s.userId === user.id);
      if (mySeat && mySeat.cards.length) {
        socket.emit('table:cards', mySeat.cards.map(cardLabel));
      }

      socket.on('table:sit', async (payload) => {
        const seatIndex = Number(payload && payload.seatIndex);
        const res = await currentTablePoker.sit(user, seatIndex);
        if (res.error) socket.emit('table:error', res.error);
        if (reqRoomId) checkUserRoomCleanup(reqRoomId);
      });

      socket.on('table:stand', async () => {
        const res = await currentTablePoker.stand(user.id);
        if (res.error) socket.emit('table:error', res.error);
        if (reqRoomId) checkUserRoomCleanup(reqRoomId);
      });

      socket.on('table:action', (payload) => {
        const res = currentTablePoker.handleAction(user.id, payload && payload.action, payload && payload.amount);
        if (res.error) socket.emit('table:error', res.error);
      });
      socket.on('table:emote', (payload) => {
        if (!payload || !payload.emote) return;
        const mySeat = currentTablePoker.seats.find((s) => s && s.userId === user.id);
        if (mySeat) {
          io.to(reqRoomId || 'poker').emit('table:emote', { userId: user.id, emote: payload.emote });
        }
      });

      socket.on('table:gift', async (payload) => {
        if (!payload || !payload.targetUserId) return;
        const res = await handleGift(user.id, payload.targetUserId, 100);
        if (res.error) {
          socket.emit('table:error', res.error);
        } else {
          io.to(reqRoomId || 'poker').emit('table:gift', { fromUserId: user.id, targetUserId: payload.targetUserId, amount: 100 });
        }
      });
    } else if (game === 'turkpoker') {
      socket.emit('turkpoker:state', currentTableTurkPoker.getPublicState());
      const mySeat = currentTableTurkPoker.seats.find((s) => s && s.userId === user.id);
      if (mySeat && mySeat.cards.length) {
        socket.emit('turkpoker:cards', mySeat.cards.map(cardLabel));
      }

      socket.on('turkpoker:sit', async (payload) => {
        const seatIndex = Number(payload && payload.seatIndex);
        const res = await currentTableTurkPoker.sit(user, seatIndex);
        if (res.error) socket.emit('turkpoker:error', res.error);
        if (reqRoomId) checkUserRoomCleanup(reqRoomId);
      });

      socket.on('turkpoker:stand', async () => {
        const res = await currentTableTurkPoker.stand(user.id);
        if (res.error) socket.emit('turkpoker:error', res.error);
        if (reqRoomId) checkUserRoomCleanup(reqRoomId);
      });

      socket.on('turkpoker:action', (payload) => {
        const amountOrCards = payload && (payload.cards !== undefined ? payload.cards : payload.amount);
        const res = currentTableTurkPoker.handleAction(user.id, payload && payload.action, amountOrCards);
        if (res.error) socket.emit('turkpoker:error', res.error);
      });
      
      socket.on('turkpoker:draw', (payload) => {
        const res = currentTableTurkPoker.handleDraw(user.id, payload && payload.discards);
        if (res.error) socket.emit('turkpoker:error', res.error);
      });

      socket.on('turkpoker:addbot', (payload) => {
        const seatIndex = payload && Number.isInteger(payload.seatIndex) ? payload.seatIndex : null;
        const res = currentTableTurkPoker.addBot(seatIndex);
        if (res.error) socket.emit('turkpoker:error', res.error);
        if (reqRoomId) checkUserRoomCleanup(reqRoomId);
      });
      
      socket.on('turkpoker:removebots', () => {
        const res = currentTableTurkPoker.removeBots();
        if (res.error) socket.emit('turkpoker:error', res.error);
        if (reqRoomId) checkUserRoomCleanup(reqRoomId);
      });

      socket.on('turkpoker:emote', (payload) => {
        if (!payload || !payload.emote) return;
        const mySeat = currentTableTurkPoker.seats.find((s) => s && s.userId === user.id);
        if (mySeat) {
          io.to(reqRoomId || 'turkpoker').emit('turkpoker:emote', { userId: user.id, emote: payload.emote });
        }
      });

      socket.on('turkpoker:gift', async (payload) => {
        if (!payload || !payload.targetUserId) return;
        const res = await handleGift(user.id, payload.targetUserId, 100);
        if (res.error) {
          socket.emit('turkpoker:error', res.error);
        } else {
          io.to(reqRoomId || 'turkpoker').emit('turkpoker:gift', { fromUserId: user.id, targetUserId: payload.targetUserId, amount: 100 });
        }
      });
    } else if (game === 'okey') {
      socket.emit('okey:state', currentTableOkey.getPublicState());
      const mySeat = currentTableOkey.seats.find((s) => s && s.userId === user.id);
      if (mySeat && mySeat.tiles.length) {
        socket.emit('okey:tiles', mySeat.tiles);
      }

      socket.on('okey:sit', async (payload) => {
        const seatIndex = Number(payload && payload.seatIndex);
        const res = await currentTableOkey.sit(user, seatIndex);
        if (res.error) socket.emit('okey:error', res.error);
        if (reqRoomId) checkUserRoomCleanup(reqRoomId);
      });

      socket.on('okey:stand', () => {
        const res = currentTableOkey.stand(user.id);
        if (res.error) socket.emit('okey:error', res.error);
        if (reqRoomId) checkUserRoomCleanup(reqRoomId);
      });

      socket.on('okey:draw', (payload) => {
        const res = currentTableOkey.handleDraw(user.id, payload && payload.source);
        if (res.error) socket.emit('okey:error', res.error);
      });

      socket.on('okey:discard', (payload) => {
        const res = currentTableOkey.handleDiscard(user.id, payload && payload.tileId);
        if (res.error) socket.emit('okey:error', res.error);
      });

      socket.on('okey:finish', () => {
        const res = currentTableOkey.handleFinish(user.id);
        if (res.error) socket.emit('okey:error', res.error);
      });

      socket.on('okey:addbot', (payload) => {
        const seatIndex = payload && Number.isInteger(payload.seatIndex) ? payload.seatIndex : null;
        const res = currentTableOkey.addBot(seatIndex);
        if (res.error) socket.emit('okey:error', res.error);
        if (reqRoomId) checkUserRoomCleanup(reqRoomId);
      });

      socket.on('okey:fillbots', () => {
        let added = 0;
        for (let i = 0; i < currentTableOkey.seats.length; i++) {
          if (!currentTableOkey.seats[i]) {
            const res = currentTableOkey.addBot(i);
            if (res.ok) added++;
          }
        }
        if (!added) socket.emit('okey:error', 'Eklenecek bos koltuk yok.');
        if (reqRoomId) checkUserRoomCleanup(reqRoomId);
      });

      socket.on('okey:removebots', () => {
        const res = currentTableOkey.removeBots();
        if (res.error) socket.emit('okey:error', res.error);
        if (reqRoomId) checkUserRoomCleanup(reqRoomId);
      });

      socket.on('okey:emote', (payload) => {
        if (!payload || !payload.emote) return;
        const mySeat = currentTableOkey.seats.find((s) => s && s.userId === user.id);
        if (mySeat) {
          io.to(reqRoomId || 'okey').emit('okey:emote', { userId: user.id, emote: payload.emote });
        }
      });

      socket.on('okey:gift', async (payload) => {
        if (!payload || !payload.targetUserId) return;
        const res = await handleGift(user.id, payload.targetUserId, 100);
        if (res.error) {
          socket.emit('okey:error', res.error);
        } else {
          io.to(reqRoomId || 'okey').emit('okey:gift', { fromUserId: user.id, targetUserId: payload.targetUserId, amount: 100 });
        }
      });
    } else if (game === 'okey101') {
      // ---- 101 Okey ----
      socket.emit('okey101:state', currentTable101.getPublicState());
      const mySeat101 = currentTable101.seats.find((s) => s && s.userId === user.id);
      if (mySeat101 && mySeat101.tiles.length) {
        socket.emit('okey101:tiles', mySeat101.tiles);
      }

      socket.on('okey101:sit', async (payload) => {
        const seatIndex = Number(payload && payload.seatIndex);
        const res = await currentTable101.sit(user, seatIndex);
        if (res.error) socket.emit('okey101:error', res.error);
        if (reqRoomId) checkUserRoomCleanup(reqRoomId);
      });

      socket.on('okey101:stand', () => {
        const res = currentTable101.stand(user.id);
        if (res.error) socket.emit('okey101:error', res.error);
        if (reqRoomId) checkUserRoomCleanup(reqRoomId);
      });

      socket.on('okey101:draw', (payload) => {
        const res = currentTable101.handleDraw(user.id, payload && payload.source);
        if (res.error) socket.emit('okey101:error', res.error);
      });

      socket.on('okey101:open', (payload) => {
        const res = currentTable101.handleOpen(
          user.id,
          payload && payload.kind,
          payload && payload.groups
        );
        if (res.error) socket.emit('okey101:error', res.error);
      });

      socket.on('okey101:showIndicator', () => {
        const res = currentTable101.handleShowIndicator(user.id);
        if (res && res.error) socket.emit('okey101:error', res.error);
      });

      socket.on('okey101:process', (payload) => {
        const res = currentTable101.handleProcess(
          user.id,
          payload && payload.tileId,
          payload && payload.meldId,
          payload && payload.targetJokerId
        );
        if (res.error) {
          socket.emit('okey101:error', res.error);
        } else if (res.jokerStolen) {
          io.to(`okey101_${tableId}`).emit('okey101:jokerStolen', {
            userId: user.id,
            meldId: res.meldId
          });
        }
      });

      socket.on('okey101:discard', (payload) => {
        const res = currentTable101.handleDiscard(user.id, payload && payload.tileId);
        if (res.error) socket.emit('okey101:error', res.error);
      });

      socket.on('okey101:addbot', (payload) => {
        const seatIndex = payload && Number.isInteger(payload.seatIndex) ? payload.seatIndex : null;
        const res = currentTable101.addBot(seatIndex);
        if (res.error) socket.emit('okey101:error', res.error);
        if (reqRoomId) checkUserRoomCleanup(reqRoomId);
      });

      socket.on('okey101:fillbots', () => {
        let added = 0;
        for (let i = 0; i < currentTable101.seats.length; i++) {
          if (!currentTable101.seats[i]) {
            const res = currentTable101.addBot(i);
            if (res.ok) added++;
          }
        }
        if (!added) socket.emit('okey101:error', 'Eklenecek bos koltuk yok.');
        if (reqRoomId) checkUserRoomCleanup(reqRoomId);
      });

      socket.on('okey101:removebots', () => {
        const res = currentTable101.removeBots();
        if (res.error) socket.emit('okey101:error', res.error);
        if (reqRoomId) checkUserRoomCleanup(reqRoomId);
      });

      socket.on('okey101:emote', (payload) => {
        if (!payload || !payload.emote) return;
        const mySeat = currentTable101.seats.find((s) => s && s.userId === user.id);
        if (mySeat) {
          io.to(reqRoomId || 'okey101').emit('okey101:emote', { userId: user.id, emote: payload.emote });
        }
      });

      socket.on('okey101:gift', async (payload) => {
        if (!payload || !payload.targetUserId) return;
        const res = await handleGift(user.id, payload.targetUserId, 100);
        if (res.error) {
          socket.emit('okey101:error', res.error);
        } else {
          io.to(reqRoomId || 'okey101').emit('okey101:gift', { fromUserId: user.id, targetUserId: payload.targetUserId, amount: 100 });
        }
      });
    }

    socket.on('chat:message', async (payload) => {
      if (!payload || typeof payload.text !== 'string') return;
      const channel = payload.channel;
      const validChannels = ['genel', 'oyun', 'okey', 'okey101', 'poker', 'turkpoker', 'salon_okey', 'salon_okey101', 'salon_poker', 'salon_turkpoker'];
      if (!validChannels.includes(channel)) return;
      const text = payload.text.trim().slice(0, 500);
      if (!text) return;

      const room = channel === 'genel' ? 'lobby' : game;

      const saved = await db.insertMessage({ userId: user.id, username: name, channel, content: text });
      io.to(room).emit('chat:message', {
        channel,
        username: name,
        content: text,
        created_at: saved.created_at,
      });
    });

    socket.on('disconnect', () => {
      onlinePlayers.delete(socket.id);
      broadcastPlayers();
      broadcastLobbyPlayers().catch(() => {});
      if (game !== 'lobby') {
        systemMessage(`${name} masadan ayrildi.`, game).catch(console.error);
      }
      const stillConnected = Array.from(onlinePlayers.values()).some((p) => p.userId === user.id);
      if (!stillConnected && game === 'poker' && table.findSeatByUser(user.id) !== -1) {
        const timer = setTimeout(() => {
          pendingStandTimers.delete(user.id);
          table.stand(user.id).catch(console.error);
        }, RECONNECT_GRACE_MS);
        pendingStandTimers.set(user.id, timer);
      }
      if (!stillConnected && game === 'turkpoker' && turkPokerTable.findSeatByUser(user.id) !== -1) {
        const timer = setTimeout(() => {
          pendingStandTimersTurkPoker.delete(user.id);
          turkPokerTable.stand(user.id).catch(console.error);
        }, RECONNECT_GRACE_MS);
        pendingStandTimersTurkPoker.set(user.id, timer);
      }
      if (!stillConnected && game === 'okey' && okeyTable.findSeatByUser(user.id) !== -1) {
        const timer = setTimeout(() => {
          pendingStandTimersOkey.delete(user.id);
          const res = okeyTable.stand(user.id);
          if (res.error) console.error('Okey otomatik kalkma hatasi:', res.error);
        }, RECONNECT_GRACE_MS);
        pendingStandTimersOkey.set(user.id, timer);
      }
      if (reqRoomId && activeUserRooms.has(reqRoomId)) {
        const room = activeUserRooms.get(reqRoomId);
        room.table.stand(user.id);
        checkUserRoomCleanup(reqRoomId);
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

app.use((err, req, res, next) => {
  writeStartupLog(`Route hatasi: ${req.method} ${req.url}`, err);
  next(err);
});

function gracefulShutdown() {
  refundSeatedPlayers()
    .catch((err) => console.error('Iade sirasinda hata:', err))
    .finally(() => process.exit(0));
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// ================= GÜNLÜK GÖREV SIFIRLAMA KONTROLÜ =================
let lastCheckedDate = new Date().toDateString();
setInterval(async () => {
  const currentDate = new Date().toDateString();
  if (currentDate !== lastCheckedDate) {
    lastCheckedDate = currentDate;
    try {
      await db.clearNonFixedDailyTasks();
      console.log('Yeni gün başladı: Sabit olmayan günlük görevler temizlendi.');
    } catch (err) {
      console.error('Günlük görevleri temizlerken hata:', err);
    }
  }
}, 60 * 1000); // Her dakika kontrol et

async function initSystemPokerRooms() {
  try {
    const config = await db.getPokerConfig();
    const tableCount = config ? config.table_count : 10;
    
    // Açık Poker Masaları
    for (let i = 1; i <= tableCount; i++) {
      const roomId = 'room_poker_sys_' + i;
      const tableInstance = new PokerTable();
      tableInstance.stake = 500;
      tableInstance.gameMode = 'Tek';
      tableInstance.gameType = 'Katlamasız';
      
      const roomObj = {
        id: roomId,
        game: 'poker',
        title: `Masa ${i}`,
        stake: 500,
        mode: 'solo',
        privacy: 'public',
        password: '',
        creatorId: 0,
        creatorName: 'Sistem',
        table: tableInstance,
        createdAt: Date.now(),
        isSystem: true
      };
      
      activeUserRooms.set(roomId, roomObj);
      wireTableEvents(tableInstance, 'poker', roomId);
    }
    
    // Türk Pokeri Masaları
    for (let i = 1; i <= tableCount; i++) {
      const roomId = 'room_turkpoker_sys_' + i;
      const tableInstance = new TurkPokerTable();
      tableInstance.stake = 500;
      tableInstance.gameMode = 'Tek';
      tableInstance.gameType = 'Katlamasız';
      
      const roomObj = {
        id: roomId,
        game: 'turkpoker',
        title: `Masa ${i}`,
        stake: 500,
        mode: 'solo',
        privacy: 'public',
        password: '',
        creatorId: 0,
        creatorName: 'Sistem',
        table: tableInstance,
        createdAt: Date.now(),
        isSystem: true
      };
      
      activeUserRooms.set(roomId, roomObj);
      wireTableEvents(tableInstance, 'turkpoker', roomId);
    }

    // 101 Okey Masaları
    for (let i = 1; i <= tableCount; i++) {
      const roomId = 'room_okey101_sys_' + i;
      const tableInstance = new Okey101Table();
      tableInstance.stake = 500;
      
      const roomObj = {
        id: roomId,
        game: 'okey101',
        title: `Masa ${i}`,
        stake: 500,
        mode: 'solo',
        privacy: 'public',
        password: '',
        creatorId: 0,
        creatorName: 'Sistem',
        table: tableInstance,
        createdAt: Date.now(),
        isSystem: true
      };
      
      activeUserRooms.set(roomId, roomObj);
      wireTableEvents(tableInstance, 'okey101', roomId);
    }

    // Düz Okey Masaları
    for (let i = 1; i <= tableCount; i++) {
      const roomId = 'room_okey_sys_' + i;
      const tableInstance = new OkeyTable();
      tableInstance.stake = 500;
      
      const roomObj = {
        id: roomId,
        game: 'okey',
        title: `Masa ${i}`,
        stake: 500,
        mode: 'solo',
        privacy: 'public',
        password: '',
        creatorId: 0,
        creatorName: 'Sistem',
        table: tableInstance,
        createdAt: Date.now(),
        isSystem: true
      };
      
      activeUserRooms.set(roomId, roomObj);
      wireTableEvents(tableInstance, 'okey', roomId);
    }
    console.log(`${tableCount} adet sabit Oyun (Poker, Türk Pokeri, Okey 101, Okey) masası oluşturuldu.`);
  } catch (err) {
    console.error('Sistem oyun masaları oluşturulamadı:', err);
  }
}

async function reinitSystemPokerRooms(newCount) {
  try {
    const currentRooms = Array.from(activeUserRooms.keys());
    const sysPokerRooms = currentRooms.filter(id => id.startsWith('room_poker_sys_'));
    const sysTurkPokerRooms = currentRooms.filter(id => id.startsWith('room_turkpoker_sys_'));
    const sysOkey101Rooms = currentRooms.filter(id => id.startsWith('room_okey101_sys_'));
    const sysOkeyRooms = currentRooms.filter(id => id.startsWith('room_okey_sys_'));

    for (let i = 1; i <= Math.max(newCount, sysPokerRooms.length); i++) {
      const roomId = 'room_poker_sys_' + i;
      if (i <= newCount && !activeUserRooms.has(roomId)) {
        const tableInstance = new PokerTable();
        tableInstance.stake = 500;
        tableInstance.gameMode = 'Tek';
        tableInstance.gameType = 'Katlamasız';
        const roomObj = {
          id: roomId, game: 'poker', title: `Masa ${i}`, stake: 500, mode: 'solo', privacy: 'public', password: '', creatorId: 0, creatorName: 'Sistem', table: tableInstance, createdAt: Date.now(), isSystem: true
        };
        activeUserRooms.set(roomId, roomObj);
        wireTableEvents(tableInstance, 'poker', roomId);
      } else if (i > newCount && activeUserRooms.has(roomId)) {
        const room = activeUserRooms.get(roomId);
        if (room && room.table.seats.filter(s => s && !s.isBot).length === 0) {
           activeUserRooms.delete(roomId);
        }
      }
    }

    for (let i = 1; i <= Math.max(newCount, sysTurkPokerRooms.length); i++) {
      const roomId = 'room_turkpoker_sys_' + i;
      if (i <= newCount && !activeUserRooms.has(roomId)) {
        const tableInstance = new TurkPokerTable();
        tableInstance.stake = 500;
        tableInstance.gameMode = 'Tek';
        tableInstance.gameType = 'Katlamasız';
        const roomObj = {
          id: roomId, game: 'turkpoker', title: `Masa ${i}`, stake: 500, mode: 'solo', privacy: 'public', password: '', creatorId: 0, creatorName: 'Sistem', table: tableInstance, createdAt: Date.now(), isSystem: true
        };
        activeUserRooms.set(roomId, roomObj);
        wireTableEvents(tableInstance, 'turkpoker', roomId);
      } else if (i > newCount && activeUserRooms.has(roomId)) {
        const room = activeUserRooms.get(roomId);
        if (room && room.table.seats.filter(s => s && !s.isBot).length === 0) {
           activeUserRooms.delete(roomId);
        }
      }
    }
    
    for (let i = 1; i <= Math.max(newCount, sysOkey101Rooms.length); i++) {
      const roomId = 'room_okey101_sys_' + i;
      if (i <= newCount && !activeUserRooms.has(roomId)) {
        const tableInstance = new Okey101Table();
        tableInstance.stake = 500;
        const roomObj = {
          id: roomId, game: 'okey101', title: `Masa ${i}`, stake: 500, mode: 'solo', privacy: 'public', password: '', creatorId: 0, creatorName: 'Sistem', table: tableInstance, createdAt: Date.now(), isSystem: true
        };
        activeUserRooms.set(roomId, roomObj);
        wireTableEvents(tableInstance, 'okey101', roomId);
      } else if (i > newCount && activeUserRooms.has(roomId)) {
        const room = activeUserRooms.get(roomId);
        if (room && room.table.seats.filter(s => s && !s.isBot).length === 0) {
           activeUserRooms.delete(roomId);
        }
      }
    }
    
    for (let i = 1; i <= Math.max(newCount, sysOkeyRooms.length); i++) {
      const roomId = 'room_okey_sys_' + i;
      if (i <= newCount && !activeUserRooms.has(roomId)) {
        const tableInstance = new OkeyTable();
        tableInstance.stake = 500;
        const roomObj = {
          id: roomId, game: 'okey', title: `Masa ${i}`, stake: 500, mode: 'solo', privacy: 'public', password: '', creatorId: 0, creatorName: 'Sistem', table: tableInstance, createdAt: Date.now(), isSystem: true
        };
        activeUserRooms.set(roomId, roomObj);
        wireTableEvents(tableInstance, 'okey', roomId);
      } else if (i > newCount && activeUserRooms.has(roomId)) {
        const room = activeUserRooms.get(roomId);
        if (room && room.table.seats.filter(s => s && !s.isBot).length === 0) {
           activeUserRooms.delete(roomId);
        }
      }
    }

    broadcastUserRooms('poker');
    broadcastUserRooms('turkpoker');
    broadcastUserRooms('okey101');
    broadcastUserRooms('okey');
    console.log(`Sistem masaları yeniden düzenlendi. Yeni limit: ${newCount}`);
  } catch (err) {
    console.error('Sistem oyun masaları güncellenemedi:', err);
  }
}

db.init()
  .then(async () => {
    await initSystemPokerRooms();
    server.listen(PORT, () => {
      console.log(`LOOTIV sunucusu ${PORT} portunda çalışıyor`);
    });
  })
  .catch((err) => {
    writeStartupLog('Veritabani baslatilamadi', err);
    process.exit(1);
  });
