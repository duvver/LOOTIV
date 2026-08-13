import re

# 1. Admin UI Add count input
with open('views/admin.ejs', 'r', encoding='utf-8') as f:
    admin_content = f.read()

submit_btn = '<button type="submit" class="adm-btn adm-btn-primary">Masayi Ekle</button>'
new_count_html = '''
                <div class="adm-form-group">
                  <label>Masa Adeti (Kac adet eklensin?)</label>
                  <input type="number" name="count" class="adm-input" value="1" min="1" max="50" required>
                </div>
                ''' + submit_btn

admin_content = admin_content.replace(submit_btn, new_count_html)

with open('views/admin.ejs', 'w', encoding='utf-8') as f:
    f.write(admin_content)


# 2. Server route update
with open('server.js', 'r', encoding='utf-8') as f:
    server_content = f.read()

old_route = '''app.post('/admin/game_tables', requireAdmin, asyncHandler(async (req, res) => {
  const { game_slug } = req.body;
  const currentTables = await db.getAllGameTables();
  const gameCount = currentTables.filter(t => t.game_slug === game_slug).length;
  const title = "Masa #" + (gameCount + 1);
  const stake = 1000;
  await db.addGameTable(game_slug, title, stake);
  await initSystemTables();
  res.redirect('/admin');
}));'''

new_route = '''app.post('/admin/game_tables', requireAdmin, asyncHandler(async (req, res) => {
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
}));'''

server_content = server_content.replace(old_route, new_route)

with open('server.js', 'w', encoding='utf-8') as f:
    f.write(server_content)
