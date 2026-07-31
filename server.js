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
const { OkeyTable } = require('./lib/okeyTable');
const { Okey101Table } = require('./lib/okey101Table');

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
// Avatar (profil resmi) data-URL olarak gonderilebildigi icin limit yukseltildi.
app.use(express.urlencoded({ extended: false, limit: '3mb' }));
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
  if (req.session.userId) {
    await db.syncVip(req.session.userId).catch(() => {});
    const user = await db.getUserById(req.session.userId);
    if (user) {
      req.user = user;
      res.locals.unreadCount = await db
        .getUnreadAnnouncementCount(user.id, user.last_seen_announcement_id)
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
    let scratchToday = null;
    let announcements = [];
    let friends = [];
    if (req.user) {
      if (dailyQuestion && dailyQuestion.active) {
        dailyAnswer = await db.getUserDailyAnswer(req.user.id, dailyQuestion.version);
      }
      if (scratchConfig && scratchConfig.active) {
        scratchToday = await db.getUserScratchToday(req.user.id);
      }
      announcements = await db.getAnnouncements(4).catch(() => []);
      friends = await db.getFriends(req.user.id).catch(() => []);
    }

    res.render('lobby', {
      user: req.user || null,
      loginError,
      loginIdentifier,
      dailyQuestion,
      dailyAnswer,
      scratchConfig,
      scratchToday,
      announcements,
      friends,
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
  requireAuth,
  asyncHandler(async (req, res) => {
    res.render('karakter-sec', { user: req.user, characters: CHARACTERS });
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

// ================= Pazar (LT ile alim/satim) =================
app.get(
  '/pazar',
  attachUser,
  asyncHandler(async (req, res) => {
    const filters = {
      category: req.query.kategori || null,
      rarity: req.query.nadirlik || null,
      q: (req.query.ara || '').trim() || null,
      minPrice: req.query.min ? Number(req.query.min) : null,
      maxPrice: req.query.max ? Number(req.query.max) : null,
    };
    const [listings, stats, recentSales, cfg] = await Promise.all([
      db.getActiveListings(filters),
      db.getMarketStats(),
      db.getRecentSales(8),
      db.getMarketConfig(),
    ]);
    const myListings = req.user ? await db.getMyListings(req.user.id) : [];
    res.render('pazar', {
      user: req.user || null,
      listings,
      stats,
      recentSales,
      myListings,
      filters,
      commission: cfg.commission_percent,
      categories: db.MARKET_CATEGORIES,
      rarities: db.MARKET_RARITIES,
      info: req.query.info || null,
      error: req.query.error || null,
    });
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
    if (!Number.isFinite(priceLt) || priceLt <= 0) {
      return res.redirect('/pazar/ilan?error=' + encodeURIComponent('Gecerli bir fiyat gir (0dan buyuk).'));
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
  requireAuth,
  asyncHandler(async (req, res) => {
    const items = await db.getUserInventory(req.user.id);
    res.render('envanter', {
      user: req.user,
      items,
      info: req.query.info || null,
      error: req.query.error || null,
    });
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
    if (!Number.isFinite(priceLt) || priceLt <= 0) {
      const cfg = await db.getMarketConfig();
      return res.render('pazar-sat', { user: req.user, item, commission: cfg.commission_percent, error: 'Gecerli bir fiyat gir (0dan buyuk).' });
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

// ---- Poker odasi ----
app.get('/poker', attachUser, requireAuth, (req, res) => {
  res.render('poker', { user: req.user });
});

// ---- Canak Okey odasi ----
app.get('/okey', attachUser, requireAuth, (req, res) => {
  res.render('okey', { user: req.user });
});

// ---- 101 Okey odasi ----
app.get('/okey101', attachUser, requireAuth, (req, res) => {
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
  },
  okey: {
    slug: 'okey',
    name: 'Canak Okey',
    icon: '&#127922;',
    accent: '#993556',
    playUrl: '/okey',
    desc: '4 kisilik masada gosterge ve okey ile klasik okey.',
  },
  poker: {
    slug: 'poker',
    name: 'Turk Pokeri',
    icon: '&#127183;',
    accent: '#185fa5',
    playUrl: '/poker',
    desc: 'Canli oyuncularla masaya otur, sohbet et.',
  },
};

// Bahis salonlari kaldirildi. Masa min. LT'sini kullanici serbest belirler.
app.get('/oyun/:oyun', attachUser, requireAuth, (req, res) => {
  const meta = GAME_META[req.params.oyun];
  if (!meta) return res.redirect('/');
  res.render('salon', { user: req.user, meta });
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
    const catalogItems = await db.getCatalogItems();
    const activeListings = await db.getAllActiveListings(200);
    const marketConfig = await db.getMarketConfig();
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
      categories: db.MARKET_CATEGORIES,
      rarities: db.MARKET_RARITIES,
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
    res.redirect('/admin?saved=market');
  })
);

app.post(
  '/admin/market/item/:id/sil',
  attachUser,
  requireAdmin,
  asyncHandler(async (req, res) => {
    await db.deleteCatalogItem(Number(req.params.id));
    res.redirect('/admin?saved=market');
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
    res.redirect('/admin?saved=market');
  })
);

app.post(
  '/admin/market/listing/:id/sil',
  attachUser,
  requireAdmin,
  asyncHandler(async (req, res) => {
    await db.adminRemoveListing(Number(req.params.id));
    res.redirect('/admin?saved=market');
  })
);

app.post(
  '/admin/market/commission',
  attachUser,
  requireAdmin,
  asyncHandler(async (req, res) => {
    await db.setCommission(req.body.commission);
    res.redirect('/admin?saved=market');
  })
);

// ---- 500 hata sayfasi (asyncHandler'dan gelen hatalar) ----
app.use((err, req, res, next) => {
  writeStartupLog(`Route hatasi: ${req.method} ${req.originalUrl}`, err);
  res.status(500).send('Bir sunucu hatasi olustu.');
});

// ================= Socket.IO (Turk Pokeri + 101 Okey) =================
const onlinePlayers = new Map(); // socket.id -> { userId, name }
const CHANNELS = ['genel', 'oyun', 'okey', 'okey101', 'sistem'];

function broadcastPlayers() {
  const uniqueByUser = new Map();
  for (const p of onlinePlayers.values()) uniqueByUser.set(p.userId, p.name);
  io.emit('poker:players', Array.from(uniqueByUser.values()));
}

// Lobi sag panelindeki aktif kullanicilar + LT listesi.
async function broadcastLobbyPlayers() {
  const ids = Array.from(new Set(Array.from(onlinePlayers.values()).map((p) => p.userId)));
  let brief = [];
  try {
    brief = await db.getUsersBrief(ids);
  } catch (err) {
    brief = [];
  }
  const byId = new Map(brief.map((u) => [u.id, u]));
  const list = ids
    .map((id) => {
      const u = byId.get(id);
      if (!u) return null;
      return {
        rumuz: u.rumuz,
        lt: u.lt_balance,
        avatar: u.avatar_url,
        vip: u.vip_tier,
        character: u.character_class,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.lt - a.lt);
  io.to('lobby').emit('lobby:players', list);
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

async function gameLogMessage(text, channel = 'oyun') {
  const saved = await db.insertMessage({ userId: null, username: 'Masa', channel, content: text });
  io.emit('chat:message', {
    channel,
    username: 'Masa',
    content: text,
    created_at: saved.created_at,
  });
}

const table = new PokerTable();
const pendingStandTimers = new Map();
const RECONNECT_GRACE_MS = 8000;

table.on('log', (text) => gameLogMessage(text, 'oyun').catch(console.error));
table.on('update', (state) => io.to('poker').emit('table:state', state));
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

const okeyTable = new OkeyTable();
const pendingStandTimersOkey = new Map();

okeyTable.on('log', (text) => gameLogMessage(text, 'okey').catch(console.error));
okeyTable.on('update', (state) => io.to('okey').emit('okey:state', state));
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

okey101Table.on('log', (text) => gameLogMessage(text, 'okey101').catch(console.error));
okey101Table.on('update', (state) => io.to('okey101').emit('okey101:state', state));
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
    const game = ['okey', 'okey101', 'lobby', 'notify'].includes(rawGame) ? rawGame : 'poker';
    socket.join(game);

    // Bildirim soketi: sadece duyurulari dinler; oyuncu listesine/sohbete katilmaz.
    if (game === 'notify') return;

    onlinePlayers.set(socket.id, { userId: user.id, name });

    const pendingStand = pendingStandTimers.get(user.id);
    if (pendingStand) {
      clearTimeout(pendingStand);
      pendingStandTimers.delete(user.id);
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

    if (game === 'poker') {
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
    } else if (game === 'okey') {
      socket.emit('okey:state', okeyTable.getPublicState());
      const mySeat = okeyTable.seats.find((s) => s && s.userId === user.id);
      if (mySeat && mySeat.tiles.length) {
        socket.emit('okey:tiles', mySeat.tiles);
      }

      socket.on('okey:sit', async (payload) => {
        const seatIndex = Number(payload && payload.seatIndex);
        const res = await okeyTable.sit(user, seatIndex);
        if (res.error) socket.emit('okey:error', res.error);
      });

      socket.on('okey:stand', () => {
        const res = okeyTable.stand(user.id);
        if (res.error) socket.emit('okey:error', res.error);
      });

      socket.on('okey:draw', (payload) => {
        const res = okeyTable.handleDraw(user.id, payload && payload.source);
        if (res.error) socket.emit('okey:error', res.error);
      });

      socket.on('okey:discard', (payload) => {
        const res = okeyTable.handleDiscard(user.id, payload && payload.tileId);
        if (res.error) socket.emit('okey:error', res.error);
      });

      socket.on('okey:finish', () => {
        const res = okeyTable.handleFinish(user.id);
        if (res.error) socket.emit('okey:error', res.error);
      });

      // ---- Test yardimcilari: bot ekle / cikar ----
      socket.on('okey:addbot', (payload) => {
        const seatIndex = payload && Number.isInteger(payload.seatIndex) ? payload.seatIndex : null;
        const res = okeyTable.addBot(seatIndex);
        if (res.error) socket.emit('okey:error', res.error);
      });

      socket.on('okey:fillbots', () => {
        // Bos koltuklari botla doldur (kendi koltugun haric)
        let added = 0;
        for (let i = 0; i < okeyTable.seats.length; i++) {
          if (!okeyTable.seats[i]) {
            const res = okeyTable.addBot(i);
            if (res.ok) added++;
          }
        }
        if (!added) socket.emit('okey:error', 'Eklenecek bos koltuk yok.');
      });

      socket.on('okey:removebots', () => {
        const res = okeyTable.removeBots();
        if (res.error) socket.emit('okey:error', res.error);
      });
    } else if (game === 'okey101') {
      // ---- 101 Okey ----
      socket.emit('okey101:state', okey101Table.getPublicState());
      const mySeat101 = okey101Table.seats.find((s) => s && s.userId === user.id);
      if (mySeat101 && mySeat101.tiles.length) {
        socket.emit('okey101:tiles', mySeat101.tiles);
      }

      socket.on('okey101:sit', async (payload) => {
        const seatIndex = Number(payload && payload.seatIndex);
        const res = await okey101Table.sit(user, seatIndex);
        if (res.error) socket.emit('okey101:error', res.error);
      });

      socket.on('okey101:stand', () => {
        const res = okey101Table.stand(user.id);
        if (res.error) socket.emit('okey101:error', res.error);
      });

      socket.on('okey101:draw', (payload) => {
        const res = okey101Table.handleDraw(user.id, payload && payload.source);
        if (res.error) socket.emit('okey101:error', res.error);
      });

      socket.on('okey101:open', (payload) => {
        const res = okey101Table.handleOpen(
          user.id,
          payload && payload.kind,
          payload && payload.groups
        );
        if (res.error) socket.emit('okey101:error', res.error);
      });

      socket.on('okey101:process', (payload) => {
        const res = okey101Table.handleProcess(
          user.id,
          payload && payload.tileId,
          payload && payload.meldId
        );
        if (res.error) socket.emit('okey101:error', res.error);
      });

      socket.on('okey101:discard', (payload) => {
        const res = okey101Table.handleDiscard(user.id, payload && payload.tileId);
        if (res.error) socket.emit('okey101:error', res.error);
      });

      socket.on('okey101:addbot', (payload) => {
        const seatIndex = payload && Number.isInteger(payload.seatIndex) ? payload.seatIndex : null;
        const res = okey101Table.addBot(seatIndex);
        if (res.error) socket.emit('okey101:error', res.error);
      });

      socket.on('okey101:fillbots', () => {
        let added = 0;
        for (let i = 0; i < okey101Table.seats.length; i++) {
          if (!okey101Table.seats[i]) {
            const res = okey101Table.addBot(i);
            if (res.ok) added++;
          }
        }
        if (!added) socket.emit('okey101:error', 'Eklenecek bos koltuk yok.');
      });

      socket.on('okey101:removebots', () => {
        const res = okey101Table.removeBots();
        if (res.error) socket.emit('okey101:error', res.error);
      });
    }

    socket.on('chat:message', async (payload) => {
      if (!payload || typeof payload.text !== 'string') return;
      const channel = payload.channel;
      if (channel !== 'genel' && channel !== 'oyun' && channel !== 'okey' && channel !== 'okey101') return;
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
      broadcastLobbyPlayers().catch(() => {});
      if (game !== 'lobby') {
        systemMessage(`${name} masadan ayrildi.`).catch(console.error);
      }
      const stillConnected = Array.from(onlinePlayers.values()).some((p) => p.userId === user.id);
      if (!stillConnected && game === 'poker' && table.findSeatByUser(user.id) !== -1) {
        const timer = setTimeout(() => {
          pendingStandTimers.delete(user.id);
          table.stand(user.id).catch(console.error);
        }, RECONNECT_GRACE_MS);
        pendingStandTimers.set(user.id, timer);
      }
      if (!stillConnected && game === 'okey' && okeyTable.findSeatByUser(user.id) !== -1) {
        const timer = setTimeout(() => {
          pendingStandTimersOkey.delete(user.id);
          const res = okeyTable.stand(user.id);
          if (res.error) console.error('Okey otomatik kalkma hatasi:', res.error);
        }, RECONNECT_GRACE_MS);
        pendingStandTimersOkey.set(user.id, timer);
      }
      if (!stillConnected && game === 'okey101' && okey101Table.findSeatByUser(user.id) !== -1) {
        const timer = setTimeout(() => {
          pendingStandTimers101.delete(user.id);
          const res = okey101Table.stand(user.id);
          if (res.error) console.error('101 Okey otomatik kalkma hatasi:', res.error);
        }, RECONNECT_GRACE_MS);
        pendingStandTimers101.set(user.id, timer);
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
