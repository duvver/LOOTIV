const fs = require('fs');

// 1. Admin UI Add count input
let adminEjs = fs.readFileSync('views/admin.ejs', 'utf-8');
const submitBtnHTML = '<button type="submit" class="adm-btn adm-btn-primary">Masayi Ekle</button>';
const newCountHTML = 
                <div class="adm-form-group">
                  <label>Masa Adeti (Kac adet eklensin?)</label>
                  <input type="number" name="count" class="adm-input" value="1" min="1" max="50" required>
                </div>
                 + submitBtnHTML;

adminEjs = adminEjs.replace(submitBtnHTML, newCountHTML);
fs.writeFileSync('views/admin.ejs', adminEjs);

// 2. Server route
let serverJs = fs.readFileSync('server.js', 'utf-8');

const oldRouteStr = pp.post('/admin/game_tables', requireAdmin, asyncHandler(async (req, res) => {
  const { game_slug } = req.body;
  const currentTables = await db.getAllGameTables();
  const gameCount = currentTables.filter(t => t.game_slug === game_slug).length;
  const title = "Masa #" + (gameCount + 1);
  const stake = 1000;
  await db.addGameTable(game_slug, title, stake);
  await initSystemTables();
  res.redirect('/admin');
}));;

const newRouteStr = pp.post('/admin/game_tables', requireAdmin, asyncHandler(async (req, res) => {
  const { game_slug, count } = req.body;
  const adet = parseInt(count, 10) || 1;
  const currentTables = await db.getAllGameTables();
  let gameCount = currentTables.filter(t => t.game_slug === game_slug).length;
  const stake = 1000;
  
  for (let i = 0; i < adet; i++) {
    gameCount++;
    const title = "Masa #" + gameCount;
    await db.addGameTable(game_slug, title, stake);
  }
  
  await initSystemTables();
  res.redirect('/admin');
}));;

serverJs = serverJs.replace(oldRouteStr, newRouteStr);
fs.writeFileSync('server.js', serverJs);

