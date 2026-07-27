-- LOOTIV veritabani semasi (PostgreSQL)
-- Not: Uygulama zaten ilk calistiginda bu tablolari otomatik olusturur/gunceller
-- (lib/db.js icindeki init() fonksiyonu ile). Bu dosya sadece elle
-- calistirmak isterseniz veya yedek/referans olarak verilmistir.

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  rumuz VARCHAR(30) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  lt_balance INT NOT NULL DEFAULT 500,
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
);

-- Rezerve admin rumuzlari: Emir ve Umut.
CREATE TABLE IF NOT EXISTS admin_yetkileri (
  id SERIAL PRIMARY KEY,
  rumuz VARCHAR(30) NOT NULL UNIQUE,
  user_id INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
INSERT INTO admin_yetkileri (rumuz) VALUES ('Emir'), ('Umut') ON CONFLICT (rumuz) DO NOTHING;

-- Poker el sonuclari (admin panelinde goruntulenir)
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
);

-- Gunun sorusu (tek satir, admin her guncellediginde version artar)
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
);
INSERT INTO daily_question (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS daily_question_answers (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id),
  version INT NOT NULL,
  selected_option CHAR(1),
  is_correct BOOLEAN,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, version)
);

-- Kazi kazan
CREATE TABLE IF NOT EXISTS scratch_config (
  id INT PRIMARY KEY DEFAULT 1,
  prizes TEXT NOT NULL DEFAULT '0,50,100,250,500',
  active BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
INSERT INTO scratch_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS scratch_plays (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id),
  play_date DATE NOT NULL DEFAULT CURRENT_DATE,
  prize_won INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, play_date)
);
