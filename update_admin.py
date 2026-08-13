import re

# 1. Update views/admin.ejs
with open('views/admin.ejs', 'r', encoding='utf-8') as f:
    admin_content = f.read()

# Remove Okey options
admin_content = admin_content.replace('<option value="okey">Canak Okey</option>', '')
admin_content = admin_content.replace('<option value="okey101">101 Okey</option>', '')

# Remove Masa Adi input block
admin_content = re.sub(
    r'<div class="adm-form-group">\s*<label>Masa Adi[\s\S]*?</label>\s*<input type="text" name="title" class="adm-input" placeholder="Masa Adi" required>\s*</div>',
    '',
    admin_content
)

# Remove Bahis Miktari input block
admin_content = re.sub(
    r'<div class="adm-form-group">\s*<label>Bahis Miktari[\s\S]*?</label>\s*<input type="number" name="stake" class="adm-input" value="1000" min="1" required>\s*<p class="text-xs text-outline mt-1">Poker icin Buy-In bunun 10 kati olacaktir\.</p>\s*</div>',
    '',
    admin_content
)

with open('views/admin.ejs', 'w', encoding='utf-8') as f:
    f.write(admin_content)

# 2. Update server.js
with open('server.js', 'r', encoding='utf-8') as f:
    server_content = f.read()

# Modify app.post('/admin/game_tables', ...)
new_post = '''app.post('/admin/game_tables', requireAdmin, asyncHandler(async (req, res) => {
  const { game_slug } = req.body;
  const currentTables = await db.getAllGameTables();
  const gameCount = currentTables.filter(t => t.game_slug === game_slug).length;
  const title = "Masa #" + (gameCount + 1);
  const stake = 1000;
  await db.addGameTable(game_slug, title, stake);
  await initSystemTables();
  res.redirect('/admin');
}));'''

server_content = re.sub(
    r"app\.post\('/admin/game_tables', requireAdmin, asyncHandler\(async \(req, res\) => \{[\s\S]*?res\.redirect\('/admin'\);\n\}\)\);",
    new_post,
    server_content
)

with open('server.js', 'w', encoding='utf-8') as f:
    f.write(server_content)

