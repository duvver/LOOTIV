const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'lootiv',
  connectionTimeoutMillis: 8000,
});

const STARTING_LT = 500;
const VERIFICATION_BONUS_LT = 500;
// Bu rumuzlar rezerve admin hesaplaridir. Kayit olurken rumuz bunlardan
// biriyle (buyuk/kucuk harf farketmeksizin) eslesirse otomatik admin olur.
const RESERVED_ADMIN_RUMUZLAR = ['Emir', 'Umut'];

// VIP planlari: satin alinca aninda LT + haftalik otomatik LT eklemesi.
const VIP_PLANS = {
  1: { months: 1, instant: 10000, weekly: 10000, label: 'VIP 1 (1 Aylik)' },
  2: { months: 6, instant: 15000, weekly: 15000, label: 'VIP 2 (6 Aylik)' },
  3: { months: 12, instant: 20000, weekly: 20000, label: 'VIP 3 (12 Aylik)' },
};

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      rumuz VARCHAR(30) NOT NULL UNIQUE,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      lt_balance INT NOT NULL DEFAULT ${STARTING_LT},
      avatar_url TEXT,
      role VARCHAR(20) NOT NULL DEFAULT 'uye',
      is_admin BOOLEAN NOT NULL DEFAULT FALSE,
      is_muted BOOLEAN NOT NULL DEFAULT FALSE,
      is_banned BOOLEAN NOT NULL DEFAULT FALSE,
      ban_reason TEXT,
      email_verified BOOLEAN NOT NULL DEFAULT FALSE,
      email_verification_code VARCHAR(10),
      phone VARCHAR(30),
      phone_verified BOOLEAN NOT NULL DEFAULT FALSE,
      phone_verification_code VARCHAR(10),
      verification_bonus_claimed BOOLEAN NOT NULL DEFAULT FALSE,
      vip_tier INT NOT NULL DEFAULT 0,
      vip_expires_at TIMESTAMP,
      vip_last_topup TIMESTAMP,
      terms_accepted BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  // ---- Eski kurulumlardan gelen kolonlari guncel semaya tasi ----
  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='points')
         AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='lt_balance') THEN
        ALTER TABLE users RENAME COLUMN points TO lt_balance;
      END IF;
    END $$;
  `);
  await pool.query(`ALTER TABLE users DROP COLUMN IF EXISTS bonus_points`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS lt_balance INT NOT NULL DEFAULT ${STARTING_LT}`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'uye'`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_muted BOOLEAN NOT NULL DEFAULT FALSE`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned BOOLEAN NOT NULL DEFAULT FALSE`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_reason TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_code VARCHAR(10)`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(30)`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN NOT NULL DEFAULT FALSE`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verification_code VARCHAR(10)`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_bonus_claimed BOOLEAN NOT NULL DEFAULT FALSE`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS vip_tier INT NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS vip_expires_at TIMESTAMP`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS vip_last_topup TIMESTAMP`);
  // ---- Yeni: karakter secimi + duyuru okuma takibi ----
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS character_class VARCHAR(20)`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_announcement_id INT NOT NULL DEFAULT 0`);

  // ---- Rezerve admin rumuz tablosu (yetki tablosu) ----
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_yetkileri (
      id SERIAL PRIMARY KEY,
      rumuz VARCHAR(30) NOT NULL UNIQUE,
      user_id INT REFERENCES users(id),
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  for (const rumuz of RESERVED_ADMIN_RUMUZLAR) {
    await pool.query(
      `INSERT INTO admin_yetkileri (rumuz) VALUES ($1) ON CONFLICT (rumuz) DO NOTHING`,
      [rumuz]
    );
  }
  await pool.query(`
    UPDATE admin_yetkileri ay
    SET user_id = u.id
    FROM users u
    WHERE ay.user_id IS NULL AND LOWER(u.rumuz) = LOWER(ay.rumuz)
  `);
  await pool.query(`
    UPDATE users u
    SET is_admin = TRUE
    FROM admin_yetkileri ay
    WHERE ay.user_id = u.id AND u.is_admin = FALSE
  `);

  // ---- Oyun loglari (Poker + Okey) ----
  await pool.query(`
    CREATE TABLE IF NOT EXISTS game_logs (
      id SERIAL PRIMARY KEY,
      user_id INT REFERENCES users(id),
      rumuz VARCHAR(30) NOT NULL,
      hand_number INT,
      played_lt INT NOT NULL,
      result VARCHAR(10) NOT NULL,
      lt_change INT NOT NULL,
      total_lt_snapshot INT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE game_logs ADD COLUMN IF NOT EXISTS game VARCHAR(20) NOT NULL DEFAULT 'poker'`);

  // ---- Gunun sorusu ----
  await pool.query(`
    CREATE TABLE IF NOT EXISTS daily_question (
      id INT PRIMARY KEY DEFAULT 1,
      version INT NOT NULL DEFAULT 0,
      question_text TEXT,
      option_a TEXT,
      option_b TEXT,
      option_c TEXT,
      option_d TEXT,
      correct_option CHAR(1),
      reward_lt INT NOT NULL DEFAULT 100,
      active BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`INSERT INTO daily_question (id) VALUES (1) ON CONFLICT (id) DO NOTHING`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS daily_question_answers (
      id SERIAL PRIMARY KEY,
      user_id INT REFERENCES users(id),
      version INT NOT NULL,
      selected_option CHAR(1),
      is_correct BOOLEAN,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, version)
    )
  `);

  // ---- Kazi kazan ----
  await pool.query(`
    CREATE TABLE IF NOT EXISTS scratch_config (
      id INT PRIMARY KEY DEFAULT 1,
      prizes TEXT NOT NULL DEFAULT '0,50,100,250,500',
      active BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`INSERT INTO scratch_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS scratch_plays (
      id SERIAL PRIMARY KEY,
      user_id INT REFERENCES users(id),
      play_date DATE NOT NULL DEFAULT CURRENT_DATE,
      prize_won INT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, play_date)
    )
  `);

  // ---- Poker sohbeti ----
  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      user_id INT,
      username VARCHAR(150) NOT NULL,
      channel VARCHAR(20) NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  // ---- Bloglar (kullanici yazilari) ----
  await pool.query(`
    CREATE TABLE IF NOT EXISTS blogs (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id),
      rumuz VARCHAR(30) NOT NULL,
      title VARCHAR(150) NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  // ---- Duyurular (admin -> herkes) ----
  await pool.query(`
    CREATE TABLE IF NOT EXISTS announcements (
      id SERIAL PRIMARY KEY,
      admin_id INT REFERENCES users(id),
      admin_rumuz VARCHAR(30) NOT NULL,
      title VARCHAR(150) NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  // ---- Arkadaslik (istek + kabul) ----
  await pool.query(`
    CREATE TABLE IF NOT EXISTS friendships (
      id SERIAL PRIMARY KEY,
      requester_id INT NOT NULL REFERENCES users(id),
      addressee_id INT NOT NULL REFERENCES users(id),
      status VARCHAR(12) NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE(requester_id, addressee_id)
    )
  `);

  // ---- Pazar ilanlari (LT ile alim/satim) ----
  await pool.query(`
    CREATE TABLE IF NOT EXISTS market_listings (
      id SERIAL PRIMARY KEY,
      seller_id INT NOT NULL REFERENCES users(id),
      seller_rumuz VARCHAR(30) NOT NULL,
      title VARCHAR(120) NOT NULL,
      description TEXT,
      category VARCHAR(20) NOT NULL DEFAULT 'diger',
      rarity VARCHAR(20) NOT NULL DEFAULT 'common',
      price_lt INT NOT NULL,
      image_url TEXT,
      status VARCHAR(12) NOT NULL DEFAULT 'active',
      buyer_id INT REFERENCES users(id),
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      sold_at TIMESTAMP
    )
  `);
  await pool.query(`ALTER TABLE market_listings ADD COLUMN IF NOT EXISTS inventory_id INT`);
  await pool.query(`ALTER TABLE market_listings ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP`);

  // ---- Esya katalogu (admin olusturur) ----
  await pool.query(`
    CREATE TABLE IF NOT EXISTS item_catalog (
      id SERIAL PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      category VARCHAR(20) NOT NULL DEFAULT 'diger',
      rarity VARCHAR(20) NOT NULL DEFAULT 'common',
      image_url TEXT,
      base_attributes JSONB DEFAULT '{}',
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE item_catalog ADD COLUMN IF NOT EXISTS base_attributes JSONB DEFAULT '{}'`);

  // ---- Kullanici envanteri (sahip olunan esyalar) ----
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_inventory (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id),
      catalog_id INT NOT NULL REFERENCES item_catalog(id),
      listed BOOLEAN NOT NULL DEFAULT FALSE,
      upgrade_level INT NOT NULL DEFAULT 0,
      acquired_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE user_inventory ADD COLUMN IF NOT EXISTS upgrade_level INT NOT NULL DEFAULT 0`);

  // ---- Pazar ayarlari (komisyon vb.) ----
  await pool.query(`
    CREATE TABLE IF NOT EXISTS market_config (
      id INT PRIMARY KEY DEFAULT 1,
      commission_percent INT NOT NULL DEFAULT 1
    )
  `);
  await pool.query(`INSERT INTO market_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING`);
}

async function insertMessage({ userId, username, channel, content }) {
  const result = await pool.query(
    `INSERT INTO messages (user_id, username, channel, content)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [userId ?? null, username, channel, content]
  );
  return result.rows[0];
}

async function getRecentMessages(channel, limit = 50) {
  const result = await pool.query(
    'SELECT * FROM messages WHERE channel = $1 ORDER BY id DESC LIMIT $2',
    [channel, limit]
  );
  return result.rows.reverse();
}

// ---- Kullanici CRUD ----
async function createUser({ rumuz, email, passwordHash, termsAccepted }) {
  const result = await pool.query(
    `INSERT INTO users (rumuz, email, password_hash, lt_balance, terms_accepted)
     VALUES ($1, $2, $3, ${STARTING_LT}, $4)
     RETURNING id`,
    [rumuz, email.toLowerCase(), passwordHash, !!termsAccepted]
  );
  const userId = result.rows[0].id;
  await maybeGrantReservedAdmin(userId, rumuz);
  return userId;
}

async function maybeGrantReservedAdmin(userId, rumuz) {
  const reserved = await pool.query(
    `SELECT id FROM admin_yetkileri WHERE LOWER(rumuz) = LOWER($1) AND user_id IS NULL`,
    [rumuz]
  );
  if (reserved.rows.length === 0) return;
  await pool.query(`UPDATE admin_yetkileri SET user_id = $1 WHERE id = $2`, [userId, reserved.rows[0].id]);
  await pool.query(`UPDATE users SET is_admin = TRUE WHERE id = $1`, [userId]);
}

async function getUserByEmail(email) {
  const result = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
  return result.rows[0] || null;
}

async function getUserByRumuz(rumuz) {
  const result = await pool.query('SELECT * FROM users WHERE LOWER(rumuz) = LOWER($1)', [rumuz]);
  return result.rows[0] || null;
}

async function getUserByIdentifier(identifier) {
  const value = (identifier || '').trim();
  if (!value) return null;
  if (value.includes('@')) return getUserByEmail(value);
  return getUserByRumuz(value);
}

async function getUserById(id) {
  const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  return result.rows[0] || null;
}

// ---- Profil dogrulama (demo modu) ----
async function setEmailVerificationCode(id, code) {
  await pool.query('UPDATE users SET email_verification_code = $1 WHERE id = $2', [code, id]);
}

async function verifyEmail(id) {
  await pool.query('UPDATE users SET email_verified = TRUE, email_verification_code = NULL WHERE id = $1', [id]);
  await maybeAwardVerificationBonus(id);
}

async function setPhone(id, phone) {
  await pool.query(
    'UPDATE users SET phone = $1, phone_verified = FALSE, phone_verification_code = NULL WHERE id = $2',
    [phone, id]
  );
}

async function setPhoneVerificationCode(id, code) {
  await pool.query('UPDATE users SET phone_verification_code = $1 WHERE id = $2', [code, id]);
}

async function verifyPhone(id) {
  await pool.query('UPDATE users SET phone_verified = TRUE, phone_verification_code = NULL WHERE id = $1', [id]);
  await maybeAwardVerificationBonus(id);
}

async function maybeAwardVerificationBonus(id) {
  const user = await getUserById(id);
  if (!user) return;
  if (user.email_verified && user.phone_verified && !user.verification_bonus_claimed) {
    await pool.query(
      'UPDATE users SET lt_balance = lt_balance + $1, verification_bonus_claimed = TRUE WHERE id = $2',
      [VERIFICATION_BONUS_LT, id]
    );
  }
}

// ---- Admin: kullanici yonetimi ----
async function getAllUsers() {
  const result = await pool.query('SELECT * FROM users ORDER BY created_at DESC');
  return result.rows;
}

async function getStats() {
  const result = await pool.query(`
    SELECT
      COUNT(*)::int AS total_users,
      COALESCE(SUM(lt_balance), 0)::int AS total_lt,
      COUNT(*) FILTER (WHERE email_verified AND phone_verified)::int AS verified_users,
      COUNT(*) FILTER (WHERE is_banned)::int AS banned_users,
      COUNT(*) FILTER (WHERE vip_tier > 0)::int AS vip_users
    FROM users
  `);
  return result.rows[0];
}

async function toggleMute(id) {
  const result = await pool.query('UPDATE users SET is_muted = NOT is_muted WHERE id = $1 RETURNING is_muted', [id]);
  return result.rows[0] || null;
}

async function toggleBan(id, reason) {
  const result = await pool.query(
    `UPDATE users SET is_banned = NOT is_banned, ban_reason = CASE WHEN is_banned THEN NULL ELSE $2 END WHERE id = $1 RETURNING is_banned`,
    [id, reason || null]
  );
  return result.rows[0] || null;
}

async function adjustLt(id, amount) {
  await pool.query('UPDATE users SET lt_balance = GREATEST(lt_balance + $1, 0) WHERE id = $2', [amount, id]);
}

// ---- VIP uyelik ----
function getVipPlans() {
  return VIP_PLANS;
}

async function setVip(userId, tier) {
  tier = Number(tier);
  if (!tier || !VIP_PLANS[tier]) {
    await pool.query(
      'UPDATE users SET vip_tier = 0, vip_expires_at = NULL, vip_last_topup = NULL WHERE id = $1',
      [userId]
    );
    return;
  }
  const plan = VIP_PLANS[tier];
  const now = new Date();
  const expires = new Date(now);
  expires.setMonth(expires.getMonth() + plan.months);
  await pool.query(
    `UPDATE users SET vip_tier = $1, vip_expires_at = $2, vip_last_topup = $3, lt_balance = lt_balance + $4 WHERE id = $5`,
    [tier, expires, now, plan.instant, userId]
  );
}

// Haftalik otomatik LT eklemesi + suresi dolan VIP'i dusurme.
// attachUser icinde her istekte cagrilir (durum veritabaninda tutuldugu icin
// sunucu yeniden baslasa da kaldigi yerden devam eder).
async function syncVip(userId) {
  const user = await getUserById(userId);
  if (!user || !user.vip_tier) return;
  const plan = VIP_PLANS[user.vip_tier];
  if (!plan) return;

  const now = new Date();
  if (user.vip_expires_at && new Date(user.vip_expires_at) <= now) {
    await pool.query(
      'UPDATE users SET vip_tier = 0, vip_expires_at = NULL, vip_last_topup = NULL WHERE id = $1',
      [userId]
    );
    return;
  }

  if (!user.vip_last_topup) return;
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const weeksPassed = Math.floor((now - new Date(user.vip_last_topup)) / msPerWeek);
  if (weeksPassed > 0) {
    const capped = Math.min(weeksPassed, 52); // guvenlik siniri
    const totalTopup = plan.weekly * capped;
    const newLastTopup = new Date(new Date(user.vip_last_topup).getTime() + capped * msPerWeek);
    await pool.query('UPDATE users SET lt_balance = lt_balance + $1, vip_last_topup = $2 WHERE id = $3', [
      totalTopup,
      newLastTopup,
      userId,
    ]);
  }
}

// ---- Oyun loglari (Poker + Okey) ----
async function logGameResult({ userId, rumuz, handNumber, playedLt, result, ltChange, totalLtSnapshot, game = 'poker' }) {
  await pool.query(
    `INSERT INTO game_logs (user_id, rumuz, hand_number, played_lt, result, lt_change, total_lt_snapshot, game)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [userId, rumuz, handNumber, playedLt, result, ltChange, totalLtSnapshot, game]
  );
}

async function getRecentGameLogs(limit = 200) {
  const result = await pool.query('SELECT * FROM game_logs ORDER BY created_at DESC LIMIT $1', [limit]);
  return result.rows;
}

// ---- Gunun sorusu ----
async function getDailyQuestion() {
  const result = await pool.query('SELECT * FROM daily_question WHERE id = 1');
  return result.rows[0] || null;
}

async function upsertDailyQuestion({ questionText, optionA, optionB, optionC, optionD, correctOption, rewardLt, active }) {
  await pool.query(
    `INSERT INTO daily_question (id, version, question_text, option_a, option_b, option_c, option_d, correct_option, reward_lt, active, updated_at)
     VALUES (1, 1, $1, $2, $3, $4, $5, $6, $7, $8, NOW())
     ON CONFLICT (id) DO UPDATE SET
       version = daily_question.version + 1,
       question_text = EXCLUDED.question_text,
       option_a = EXCLUDED.option_a,
       option_b = EXCLUDED.option_b,
       option_c = EXCLUDED.option_c,
       option_d = EXCLUDED.option_d,
       correct_option = EXCLUDED.correct_option,
       reward_lt = EXCLUDED.reward_lt,
       active = EXCLUDED.active,
       updated_at = NOW()`,
    [questionText, optionA, optionB, optionC, optionD, correctOption, rewardLt, !!active]
  );
}

async function getUserDailyAnswer(userId, version) {
  const result = await pool.query(
    'SELECT * FROM daily_question_answers WHERE user_id = $1 AND version = $2',
    [userId, version]
  );
  return result.rows[0] || null;
}

async function submitDailyAnswer(userId, version, selectedOption, isCorrect, rewardLt) {
  await pool.query(
    'INSERT INTO daily_question_answers (user_id, version, selected_option, is_correct) VALUES ($1, $2, $3, $4)',
    [userId, version, selectedOption, isCorrect]
  );
  if (isCorrect && rewardLt) {
    await pool.query('UPDATE users SET lt_balance = lt_balance + $1 WHERE id = $2', [rewardLt, userId]);
  }
}

// ---- Kazi kazan ----
async function getScratchConfig() {
  const result = await pool.query('SELECT * FROM scratch_config WHERE id = 1');
  return result.rows[0] || null;
}

async function upsertScratchConfig({ prizes, active }) {
  await pool.query(
    `INSERT INTO scratch_config (id, prizes, active, updated_at)
     VALUES (1, $1, $2, NOW())
     ON CONFLICT (id) DO UPDATE SET prizes = EXCLUDED.prizes, active = EXCLUDED.active, updated_at = NOW()`,
    [prizes, !!active]
  );
}

async function getUserScratchToday(userId) {
  const result = await pool.query(
    'SELECT * FROM scratch_plays WHERE user_id = $1 AND play_date = CURRENT_DATE',
    [userId]
  );
  return result.rows[0] || null;
}

async function playScratch(userId) {
  const config = await getScratchConfig();
  const prizes = (config && config.prizes ? config.prizes : '0')
    .split(',')
    .map((p) => Number(p.trim()))
    .filter((n) => Number.isFinite(n));
  const prize = prizes.length ? prizes[Math.floor(Math.random() * prizes.length)] : 0;
  await pool.query('INSERT INTO scratch_plays (user_id, prize_won) VALUES ($1, $2)', [userId, prize]);
  if (prize > 0) {
    await pool.query('UPDATE users SET lt_balance = lt_balance + $1 WHERE id = $2', [prize, userId]);
  }
  return prize;
}

// ---- Profil resmi + karakter secimi ----
async function setAvatar(id, url) {
  await pool.query('UPDATE users SET avatar_url = $1 WHERE id = $2', [url || null, id]);
}

const CHARACTER_CLASSES = ['savasci', 'rahip', 'sura', 'ninja'];

async function setCharacterClass(id, cls) {
  if (!CHARACTER_CLASSES.includes(cls)) return false;
  await pool.query('UPDATE users SET character_class = $1 WHERE id = $2', [cls, id]);
  return true;
}

// Verilen kullanici id listesinin guncel LT + avatar + karakterini getirir
// (lobi sag panelindeki aktif kullanicilar listesi icin).
async function getUsersBrief(ids) {
  if (!ids || !ids.length) return [];
  const result = await pool.query(
    'SELECT id, rumuz, lt_balance, avatar_url, character_class, vip_tier FROM users WHERE id = ANY($1)',
    [ids]
  );
  return result.rows;
}

// ---- Bloglar ----
async function createBlog(userId, rumuz, title, content) {
  const result = await pool.query(
    `INSERT INTO blogs (user_id, rumuz, title, content) VALUES ($1, $2, $3, $4) RETURNING id`,
    [userId, rumuz, title, content]
  );
  return result.rows[0].id;
}

async function getAllBlogs(limit = 50) {
  const result = await pool.query(
    `SELECT b.*, u.avatar_url FROM blogs b LEFT JOIN users u ON u.id = b.user_id
     ORDER BY b.created_at DESC LIMIT $1`,
    [limit]
  );
  return result.rows;
}

async function getBlogsByUser(userId) {
  const result = await pool.query('SELECT * FROM blogs WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
  return result.rows;
}

async function getBlogById(id) {
  const result = await pool.query(
    `SELECT b.*, u.avatar_url FROM blogs b LEFT JOIN users u ON u.id = b.user_id WHERE b.id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

async function updateBlog(id, userId, title, content) {
  const result = await pool.query(
    `UPDATE blogs SET title = $1, content = $2, updated_at = NOW() WHERE id = $3 AND user_id = $4 RETURNING id`,
    [title, content, id, userId]
  );
  return result.rowCount > 0;
}

async function deleteBlog(id, userId, isAdmin) {
  if (isAdmin) {
    const r = await pool.query('DELETE FROM blogs WHERE id = $1 RETURNING id', [id]);
    return r.rowCount > 0;
  }
  const r = await pool.query('DELETE FROM blogs WHERE id = $1 AND user_id = $2 RETURNING id', [id, userId]);
  return r.rowCount > 0;
}

// ---- Duyurular ----
async function createAnnouncement(adminId, adminRumuz, title, content) {
  const result = await pool.query(
    `INSERT INTO announcements (admin_id, admin_rumuz, title, content) VALUES ($1, $2, $3, $4) RETURNING *`,
    [adminId, adminRumuz, title, content]
  );
  return result.rows[0];
}

async function getAnnouncements(limit = 50) {
  const result = await pool.query('SELECT * FROM announcements ORDER BY id DESC LIMIT $1', [limit]);
  return result.rows;
}

async function getUnreadAnnouncementCount(userId, lastSeenId) {
  const result = await pool.query(
    'SELECT COUNT(*)::int AS c FROM announcements WHERE id > $1',
    [lastSeenId || 0]
  );
  return result.rows[0] ? result.rows[0].c : 0;
}

async function markAnnouncementsSeen(userId) {
  await pool.query(
    `UPDATE users SET last_seen_announcement_id = COALESCE((SELECT MAX(id) FROM announcements), 0) WHERE id = $1`,
    [userId]
  );
}

// ---- Arkadaslik ----
async function sendFriendRequest(requesterId, addresseeId) {
  if (requesterId === addresseeId) return { error: 'Kendine istek gonderemezsin.' };
  // Zaten arkadas veya bekleyen istek var mi (her iki yon)?
  const existing = await pool.query(
    `SELECT * FROM friendships WHERE (requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1)`,
    [requesterId, addresseeId]
  );
  if (existing.rows.length) {
    const row = existing.rows[0];
    if (row.status === 'accepted') return { error: 'Zaten arkadassiniz.' };
    return { error: 'Zaten bekleyen bir istek var.' };
  }
  await pool.query(
    `INSERT INTO friendships (requester_id, addressee_id, status) VALUES ($1, $2, 'pending')`,
    [requesterId, addresseeId]
  );
  return { ok: true };
}

async function acceptFriendRequest(friendshipId, userId) {
  const r = await pool.query(
    `UPDATE friendships SET status = 'accepted' WHERE id = $1 AND addressee_id = $2 AND status = 'pending' RETURNING id`,
    [friendshipId, userId]
  );
  return r.rowCount > 0;
}

async function removeFriendship(friendshipId, userId) {
  const r = await pool.query(
    `DELETE FROM friendships WHERE id = $1 AND (requester_id = $2 OR addressee_id = $2) RETURNING id`,
    [friendshipId, userId]
  );
  return r.rowCount > 0;
}

// Kabul edilmis arkadaslar
async function getFriends(userId) {
  const result = await pool.query(
    `SELECT f.id AS friendship_id, u.id, u.rumuz, u.avatar_url, u.character_class, u.vip_tier
     FROM friendships f
     JOIN users u ON u.id = CASE WHEN f.requester_id = $1 THEN f.addressee_id ELSE f.requester_id END
     WHERE (f.requester_id = $1 OR f.addressee_id = $1) AND f.status = 'accepted'
     ORDER BY u.rumuz ASC`,
    [userId]
  );
  return result.rows;
}

// Bana gelen bekleyen istekler
async function getIncomingRequests(userId) {
  const result = await pool.query(
    `SELECT f.id AS friendship_id, u.id, u.rumuz, u.avatar_url
     FROM friendships f JOIN users u ON u.id = f.requester_id
     WHERE f.addressee_id = $1 AND f.status = 'pending'
     ORDER BY f.created_at DESC`,
    [userId]
  );
  return result.rows;
}

// ---- Siralama (leaderboard) ----
// Skor = LT bakiyesi. Oynanan/galibiyet game_logs'tan gelir.
async function getLeaderboard(limit = 50) {
  const result = await pool.query(
    `SELECT u.id, u.rumuz, u.avatar_url, u.vip_tier, u.character_class, u.lt_balance,
            COALESCE(gl.played, 0)::int AS played,
            COALESCE(gl.wins, 0)::int AS wins
     FROM users u
     LEFT JOIN (
       SELECT user_id,
              COUNT(*) AS played,
              COUNT(*) FILTER (WHERE result = 'win') AS wins
       FROM game_logs GROUP BY user_id
     ) gl ON gl.user_id = u.id
     WHERE u.is_banned = FALSE
     ORDER BY u.lt_balance DESC, wins DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}

// ---- Pazar (market) ----
const MARKET_CATEGORIES = ['silah', 'zirh', 'koleksiyon', 'karakter', 'diger'];
const MARKET_RARITIES = ['common', 'rare', 'epic', 'legendary'];

async function getMarketConfig() {
  const result = await pool.query('SELECT * FROM market_config WHERE id = 1');
  return result.rows[0] || { commission_percent: 1 };
}

async function setCommission(percent) {
  const p = Math.max(0, Math.min(100, Math.trunc(Number(percent) || 0)));
  await pool.query('UPDATE market_config SET commission_percent = $1 WHERE id = 1', [p]);
}

// ---- Esya katalogu (admin) ----
async function createCatalogItem({ name, category, rarity, imageUrl }) {
  const cat = MARKET_CATEGORIES.includes(category) ? category : 'diger';
  const rar = MARKET_RARITIES.includes(rarity) ? rarity : 'common';
  const r = await pool.query(
    'INSERT INTO item_catalog (name, category, rarity, image_url) VALUES ($1,$2,$3,$4) RETURNING id',
    [name, cat, rar, imageUrl || null]
  );
  return r.rows[0].id;
}

async function getCatalogItems() {
  const r = await pool.query('SELECT * FROM item_catalog ORDER BY created_at DESC');
  return r.rows;
}

async function getCatalogItem(id) {
  const r = await pool.query('SELECT * FROM item_catalog WHERE id = $1', [id]);
  return r.rows[0] || null;
}

async function deleteCatalogItem(id) {
  await pool.query('DELETE FROM item_catalog WHERE id = $1', [id]);
}

// ---- Envanter ----
async function grantItemToUser(userId, catalogId) {
  await pool.query('INSERT INTO user_inventory (user_id, catalog_id) VALUES ($1, $2)', [userId, catalogId]);
}

// Kullanicinin satista OLMAYAN esyalari (envanter gorunumu).
async function getUserInventory(userId) {
  const r = await pool.query(
    `SELECT ui.id AS inv_id, ui.listed, ui.upgrade_level, c.id AS catalog_id, c.name, c.category, c.rarity, c.image_url, c.base_attributes
     FROM user_inventory ui JOIN item_catalog c ON c.id = ui.catalog_id
     WHERE ui.user_id = $1
     ORDER BY ui.acquired_at DESC`,
    [userId]
  );
  const ItemFactory = require('./items/ItemFactory');
  return r.rows.map(row => {
    const catalogData = {
      id: row.catalog_id,
      name: row.name,
      category: row.category,
      rarity: row.rarity,
      image_url: row.image_url,
      base_attributes: row.base_attributes || {}
    };
    const instanceData = {
      id: row.inv_id,
      listed: row.listed,
      upgrade_level: row.upgrade_level
    };
    return ItemFactory.create(catalogData, instanceData);
  });
}

async function getInventoryItem(invId) {
  const r = await pool.query(
    `SELECT ui.id AS inv_id, ui.user_id, ui.listed, ui.upgrade_level, c.id AS catalog_id, c.name, c.category, c.rarity, c.image_url, c.base_attributes
     FROM user_inventory ui JOIN item_catalog c ON c.id = ui.catalog_id
     WHERE ui.id = $1`,
    [invId]
  );
  if (!r.rows[0]) return null;
  const row = r.rows[0];
  const ItemFactory = require('./items/ItemFactory');
  const catalogData = {
    id: row.catalog_id,
    name: row.name,
    category: row.category,
    rarity: row.rarity,
    image_url: row.image_url,
    base_attributes: row.base_attributes || {}
  };
  const instanceData = {
    id: row.inv_id,
    user_id: row.user_id,
    listed: row.listed,
    upgrade_level: row.upgrade_level
  };
  const item = ItemFactory.create(catalogData, instanceData);
  item.user_id = row.user_id; // attach user_id for validation checks
  return item;
}

// Envanterdeki esyayi + basma (upgrade)
async function upgradeInventoryItem(invId, userId) {
  const item = await getInventoryItem(invId);
  if (!item || item.user_id !== userId) return { error: 'Bu esya sana ait degil.' };
  if (item.listed) return { error: 'Satistaki esya yukseltilemez.' };

  // Basitce leveli 1 artiriyoruz
  await pool.query('UPDATE user_inventory SET upgrade_level = upgrade_level + 1 WHERE id = $1', [invId]);
  return { ok: true, newLevel: item.upgradeLevel + 1 };
}

// Envanterdeki esyayi satisa koy (kategori/nadirlik/resim otomatik cekilir).
async function createListingFromInventory({ invId, userId, sellerRumuz, priceLt, durationHours }) {
  const item = await getInventoryItem(invId);
  if (!item || item.user_id !== userId) return { error: 'Bu esya sana ait degil.' };
  if (item.listed) return { error: 'Bu esya zaten satista.' };
  const expiresAt = durationHours ? new Date(Date.now() + Number(durationHours) * 3600 * 1000) : null;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE user_inventory SET listed = TRUE WHERE id = $1', [invId]);
    const r = await client.query(
      `INSERT INTO market_listings (seller_id, seller_rumuz, title, category, rarity, price_lt, image_url, inventory_id, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [userId, sellerRumuz, item.displayName, item.category, item.rarity, priceLt, item.imageUrl, invId, expiresAt]
    );
    await client.query('COMMIT');
    return { ok: true, id: r.rows[0].id };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function getActiveListings(filters = {}) {
  const clauses = ["status = 'active'", "(expires_at IS NULL OR expires_at > NOW())"];
  const params = [];
  if (filters.category && MARKET_CATEGORIES.includes(filters.category)) {
    params.push(filters.category);
    clauses.push(`category = $${params.length}`);
  }
  if (filters.rarity && MARKET_RARITIES.includes(filters.rarity)) {
    params.push(filters.rarity);
    clauses.push(`rarity = $${params.length}`);
  }
  if (filters.minPrice != null && Number.isFinite(filters.minPrice)) {
    params.push(filters.minPrice);
    clauses.push(`price_lt >= $${params.length}`);
  }
  if (filters.maxPrice != null && Number.isFinite(filters.maxPrice)) {
    params.push(filters.maxPrice);
    clauses.push(`price_lt <= $${params.length}`);
  }
  if (filters.q) {
    params.push('%' + filters.q + '%');
    clauses.push(`title ILIKE $${params.length}`);
  }
  const limit = filters.limit || 60;
  params.push(limit);
  const result = await pool.query(
    `SELECT * FROM market_listings WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC LIMIT $${params.length}`,
    params
  );
  return result.rows;
}

async function getListingById(id) {
  const result = await pool.query('SELECT * FROM market_listings WHERE id = $1', [id]);
  return result.rows[0] || null;
}

async function getMyListings(userId) {
  const result = await pool.query(
    'SELECT * FROM market_listings WHERE seller_id = $1 ORDER BY created_at DESC',
    [userId]
  );
  return result.rows;
}

// Ilani iptal et + envanter esyasini serbest birak.
async function cancelListing(id, userId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query(
      "UPDATE market_listings SET status = 'cancelled' WHERE id = $1 AND seller_id = $2 AND status = 'active' RETURNING inventory_id",
      [id, userId]
    );
    if (r.rowCount && r.rows[0].inventory_id) {
      await client.query('UPDATE user_inventory SET listed = FALSE WHERE id = $1', [r.rows[0].inventory_id]);
    }
    await client.query('COMMIT');
    return r.rowCount > 0;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// LT ile satin alma: LT transferi (komisyon config'ten) + envanter devri. Transaction.
async function buyListing(listingId, buyerId) {
  const cfg = await getMarketConfig();
  const commissionPct = cfg.commission_percent || 0;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const l = await client.query('SELECT * FROM market_listings WHERE id = $1 FOR UPDATE', [listingId]);
    const listing = l.rows[0];
    if (!listing || listing.status !== 'active') {
      await client.query('ROLLBACK');
      return { error: 'Ilan bulunamadi veya artik satista degil.' };
    }
    if (listing.seller_id === buyerId) {
      await client.query('ROLLBACK');
      return { error: 'Kendi ilanini satin alamazsin.' };
    }
    const b = await client.query('SELECT lt_balance FROM users WHERE id = $1 FOR UPDATE', [buyerId]);
    if (!b.rows[0] || b.rows[0].lt_balance < listing.price_lt) {
      await client.query('ROLLBACK');
      return { error: 'Yetersiz LT bakiyesi.' };
    }
    const commission = Math.floor((listing.price_lt * commissionPct) / 100);
    const sellerGain = listing.price_lt - commission;
    await client.query('UPDATE users SET lt_balance = lt_balance - $1 WHERE id = $2', [listing.price_lt, buyerId]);
    await client.query('UPDATE users SET lt_balance = lt_balance + $1 WHERE id = $2', [sellerGain, listing.seller_id]);
    await client.query(
      "UPDATE market_listings SET status = 'sold', buyer_id = $1, sold_at = NOW() WHERE id = $2",
      [buyerId, listingId]
    );
    // Envanter esyasini alicilara devret.
    if (listing.inventory_id) {
      await client.query('UPDATE user_inventory SET user_id = $1, listed = FALSE WHERE id = $2', [
        buyerId,
        listing.inventory_id,
      ]);
    }
    await client.query('COMMIT');
    return { ok: true, price: listing.price_lt, sellerGain, commission, title: listing.title };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// Admin: tum aktif ilanlari kaldir (iptal) + envanteri serbest birak.
async function adminRemoveListing(id) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query(
      "UPDATE market_listings SET status = 'cancelled' WHERE id = $1 AND status = 'active' RETURNING inventory_id",
      [id]
    );
    if (r.rowCount && r.rows[0].inventory_id) {
      await client.query('UPDATE user_inventory SET listed = FALSE WHERE id = $1', [r.rows[0].inventory_id]);
    }
    await client.query('COMMIT');
    return r.rowCount > 0;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function getAllActiveListings(limit = 200) {
  const r = await pool.query(
    "SELECT * FROM market_listings WHERE status = 'active' ORDER BY created_at DESC LIMIT $1",
    [limit]
  );
  return r.rows;
}

async function getMarketStats() {
  const result = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE status = 'active')::int AS active_count,
      COALESCE(SUM(price_lt) FILTER (WHERE status = 'sold'), 0)::int AS total_volume
    FROM market_listings
  `);
  return result.rows[0];
}

async function getRecentSales(limit = 8) {
  const result = await pool.query(
    "SELECT title, price_lt FROM market_listings WHERE status = 'sold' ORDER BY sold_at DESC LIMIT $1",
    [limit]
  );
  return result.rows;
}

module.exports = {
  pool,
  init,
  CHARACTER_CLASSES,
  MARKET_CATEGORIES,
  MARKET_RARITIES,
  getMarketConfig,
  setCommission,
  createCatalogItem,
  getCatalogItems,
  getCatalogItem,
  deleteCatalogItem,
  grantItemToUser,
  getUserInventory,
  getInventoryItem,
  upgradeInventoryItem,
  createListingFromInventory,
  getActiveListings,
  getListingById,
  getMyListings,
  cancelListing,
  buyListing,
  adminRemoveListing,
  getAllActiveListings,
  getMarketStats,
  getRecentSales,
  getLeaderboard,
  setAvatar,
  setCharacterClass,
  getUsersBrief,
  createBlog,
  getAllBlogs,
  getBlogsByUser,
  getBlogById,
  updateBlog,
  deleteBlog,
  createAnnouncement,
  getAnnouncements,
  getUnreadAnnouncementCount,
  markAnnouncementsSeen,
  sendFriendRequest,
  acceptFriendRequest,
  removeFriendship,
  getFriends,
  getIncomingRequests,
  createUser,
  getUserByEmail,
  getUserByRumuz,
  getUserByIdentifier,
  getUserById,
  insertMessage,
  getRecentMessages,
  setEmailVerificationCode,
  verifyEmail,
  setPhone,
  setPhoneVerificationCode,
  verifyPhone,
  getAllUsers,
  getStats,
  toggleMute,
  toggleBan,
  adjustLt,
  getVipPlans,
  setVip,
  syncVip,
  logGameResult,
  getRecentGameLogs,
  getDailyQuestion,
  upsertDailyQuestion,
  getUserDailyAnswer,
  submitDailyAnswer,
  getScratchConfig,
  upsertScratchConfig,
  getUserScratchToday,
  playScratch,
};
