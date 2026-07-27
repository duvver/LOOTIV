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

  // ---- Poker oyun loglari ----
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

// ---- Poker oyun loglari ----
async function logGameResult({ userId, rumuz, handNumber, playedLt, result, ltChange, totalLtSnapshot }) {
  await pool.query(
    `INSERT INTO game_logs (user_id, rumuz, hand_number, played_lt, result, lt_change, total_lt_snapshot)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [userId, rumuz, handNumber, playedLt, result, ltChange, totalLtSnapshot]
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

module.exports = {
  pool,
  init,
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
