import re

with open('server.js', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace("req.session.regenerate(() => { req.session.userId = user.id; });\n    res.redirect('/');", "req.session.regenerate((err) => { req.session.userId = user.id; req.session.save(() => { res.redirect('/'); }); });")

with open('server.js', 'w', encoding='utf-8') as f:
    f.write(content)
