require('dotenv').config();
const db = require('./lib/db');
const pool = db.pool;

(async () => {
  try {
    const userResult = await pool.query("INSERT INTO users (email, password_hash, rumuz, lt_balance) VALUES ('test_scratch@lootiv.com', 'hash', 'testscratch', 100) RETURNING id");
    const userId = userResult.rows[0].id;
    console.log('created user', userId);

    const config = await db.getScratchConfig();
    console.log('config:', config);

    const count = await db.getUserScratchCountToday(userId);
    console.log('count:', count);

    const user = await db.getUserById(userId);
    console.log('user lt:', user.lt_balance);

    await db.adjustLt(userId, -config.entry_fee);
    console.log('adjusted lt');

    await db.incrementUserTaskProgress(userId, 'play_scratchcard', 1);
    console.log('incremented task');

    const prizes = (config.prizes || '0').split(',').map(p => Number(p.trim())).filter(n => Number.isFinite(n));
    const prize = prizes.length ? prizes[0] : 0;
    
    await db.playScratch(userId, prize);
    console.log('played scratch');

    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    console.log('cleanup');
    process.exit(0);
  } catch(err) {
    console.error('CRASH:', err);
    process.exit(1);
  }
})();
