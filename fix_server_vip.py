with open('server.js', 'r', encoding='utf-8') as f:
    content = f.read()

vip_route = '''
app.get('/vip', (req, res) => {
  res.render('vip', {
    user: req.session.user || null,
    path: '/vip',
    _pendingFriends: res.locals._pendingFriends || 0
  });
});
'''

# Find a good place to insert it. For example, before app.get('/giris'
if "app.get('/giris'" in content:
    content = content.replace("app.get('/giris'", vip_route + "\napp.get('/giris'")
    with open('server.js', 'w', encoding='utf-8') as f:
        f.write(content)
    print("Added /vip route before /giris")
else:
    print("Could not find /giris route")
