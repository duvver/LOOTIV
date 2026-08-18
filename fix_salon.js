const fs = require('fs');
const file = 'C:/Users/eness/Desktop/LOOTIV/views/salon.ejs';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/window\.showGame = function\(roomId, gameSlug\) \{/, 'window.showGame = function(roomId, gameSlug, isWatch = false) { window.isWatchMode = isWatch;');

content = content.replace(
  /escapeHtml\(room\.game \|\| '<%= meta\.slug %>'\) \+ '\\'\)" class="p-2 bg-surface-container text-on-surface-variant rounded-lg hover:bg-primary\/10 transition-all cursor-pointer" title="Seyret"/g,
  `escapeHtml(room.game || '<%= meta.slug %>') + '\\', true)" class="p-2 bg-surface-container text-on-surface-variant rounded-lg hover:bg-primary/10 transition-all cursor-pointer" title="Seyret"`
);

fs.writeFileSync(file, content);
console.log("Replaced showGame in salon.ejs");
