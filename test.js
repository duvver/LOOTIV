const { pool } = require('./lib/db');
(async () => {
  try {
    const tasks = await pool.query('SELECT * FROM daily_tasks');
    console.log('Daily tasks:', tasks.rows);

    const userTasks = await pool.query('SELECT * FROM user_daily_tasks');
    console.log('User daily tasks:', userTasks.rows);
  } catch(e) { console.error(e); }
  process.exit(0);
})();
