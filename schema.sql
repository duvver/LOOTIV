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

CREATE TABLE IF NOT EXISTS admin_yetkileri (
      id SERIAL PRIMARY KEY,
      rumuz VARCHAR(30) NOT NULL UNIQUE,
      user_id INT REFERENCES users(id),
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

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

CREATE TABLE IF NOT EXISTS scratch_config (
      id INT PRIMARY KEY DEFAULT 1,
      prizes TEXT NOT NULL DEFAULT '0,50,100,250,500',
      active BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

CREATE TABLE IF NOT EXISTS scratch_plays (
      id SERIAL PRIMARY KEY,
      user_id INT REFERENCES users(id),
      play_date DATE NOT NULL DEFAULT CURRENT_DATE,
      prize_won INT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

CREATE TABLE IF NOT EXISTS daily_tasks (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      task_type VARCHAR(50) NOT NULL,
      target_count INT NOT NULL DEFAULT 1,
      reward_lt INT NOT NULL DEFAULT 0,
      is_fixed BOOLEAN NOT NULL DEFAULT FALSE,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

CREATE TABLE IF NOT EXISTS user_daily_tasks (
      id SERIAL PRIMARY KEY,
      user_id INT REFERENCES users(id) ON DELETE CASCADE,
      task_id INT REFERENCES daily_tasks(id) ON DELETE CASCADE,
      task_date DATE NOT NULL DEFAULT CURRENT_DATE,
      progress INT NOT NULL DEFAULT 0,
      is_completed BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, task_id, task_date)
    )
  `);

CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      user_id INT,
      username VARCHAR(150) NOT NULL,
      channel VARCHAR(20) NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

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

CREATE TABLE IF NOT EXISTS announcements (
      id SERIAL PRIMARY KEY,
      admin_id INT REFERENCES users(id),
      admin_rumuz VARCHAR(30) NOT NULL,
      title VARCHAR(150) NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

CREATE TABLE IF NOT EXISTS friendships (
      id SERIAL PRIMARY KEY,
      requester_id INT NOT NULL REFERENCES users(id),
      addressee_id INT NOT NULL REFERENCES users(id),
      status VARCHAR(12) NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE(requester_id, addressee_id)
    )
  `);

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

CREATE TABLE IF NOT EXISTS user_inventory (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id),
      catalog_id INT NOT NULL REFERENCES item_catalog(id),
      listed BOOLEAN NOT NULL DEFAULT FALSE,
      upgrade_level INT NOT NULL DEFAULT 0,
      acquired_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

CREATE TABLE IF NOT EXISTS market_config (
      id INT PRIMARY KEY DEFAULT 1,
      commission_percent INT NOT NULL DEFAULT 1
    )
  `);

CREATE TABLE IF NOT EXISTS vip_codes (
      id SERIAL PRIMARY KEY,
      code VARCHAR(50) UNIQUE NOT NULL,
      tier INT NOT NULL,
      platform VARCHAR(100) DEFAULT 'genel',
      is_used BOOLEAN DEFAULT FALSE,
      used_by INT REFERENCES users(id) ON DELETE SET NULL,
      used_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

CREATE TABLE IF NOT EXISTS vip_links (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      url TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

CREATE TABLE IF NOT EXISTS whitelist_events (
      id SERIAL PRIMARY KEY,
      user_id INT REFERENCES users(id) ON DELETE SET NULL,
      rumuz VARCHAR(50),
      feature VARCHAR(50) NOT NULL,
      event_type VARCHAR(20) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

CREATE TABLE IF NOT EXISTS whitelist_events (
      id SERIAL PRIMARY KEY,
      user_id INT REFERENCES users(id) ON DELETE SET NULL,
      rumuz VARCHAR(50),
      feature VARCHAR(50) NOT NULL,
      event_type VARCHAR(20) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

CREATE TABLE IF NOT EXISTS user_stats (
      user_id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      game VARCHAR(50) DEFAULT 'turkpoker',
      hands_played INT DEFAULT 0,
      hands_won INT DEFAULT 0,
      biggest_pot_won INT DEFAULT 0,
      highest_hand_rank INT DEFAULT 0,
      total_lt_won INT DEFAULT 0,
      total_lt_lost INT DEFAULT 0,
      raises_made INT DEFAULT 0,
      actions_taken INT DEFAULT 0
    )
  `);

CREATE TABLE IF NOT EXISTS daily_gifts (
      id SERIAL PRIMARY KEY,
      sender_id INT REFERENCES users(id),
      receiver_id INT REFERENCES users(id),
      amount INT,
      gift_date DATE DEFAULT CURRENT_DATE
    )
  `);

CREATE TABLE IF NOT EXISTS commission_settings (
      game VARCHAR(50) PRIMARY KEY,
      rate REAL DEFAULT 0.01
    )
  `);

CREATE TABLE IF NOT EXISTS site_commission (
      id SERIAL PRIMARY KEY,
      game VARCHAR(50),
      amount REAL,
      hand_number INT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

CREATE TABLE IF NOT EXISTS commission_withdrawals (
      id SERIAL PRIMARY KEY,
      to_user_id INT REFERENCES users(id),
      amount REAL,
      admin_note TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);