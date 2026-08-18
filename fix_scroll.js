const fs = require('fs');
const file = 'C:/Users/eness/Desktop/LOOTIV/views/salon.ejs';
let content = fs.readFileSync(file, 'utf8');

// 1. Fix the showGame logic to prevent scrollbars
content = content.replace(
  /\/\/ Scroll'a izin ver ve chat panelinin OstOne kmamas iin alttan boYluk brak[\s\S]*?main\.classList\.add\('py-8', 'pb-\[220px\]'\);\s*\}/,
  `// Oyun ekranýnda kesinlikle scroll olmamasý için body kilitleniyor (Müþteri isteði)
           document.body.classList.add('overflow-hidden', 'h-screen');
           
           const main = document.querySelector('main');
           if (main) {
               main.classList.add('flex', 'flex-col', 'overflow-hidden', 'h-full');
               main.classList.remove('pb-[220px]', 'py-8');
           }`
);

// 2. Fix the resizeGameContainer logic to calculate height from window so it's stable and strictly limits height
content = content.replace(
  /const availableWidth = gc\.clientWidth;\s*let availableHeight = gc\.clientHeight;\s*if \(availableHeight < 500\) \{\s*availableHeight = Math\.max\(500, window\.innerHeight - 320\);\s*\}/,
  `const availableWidth = window.innerWidth - 20; // Yanlardan boþluk
        let availableHeight = window.innerHeight - 150; // Üst header ve marginler için boþluk
        
        if (availableHeight < 400) availableHeight = 400;`
);

fs.writeFileSync(file, content);
console.log("Updated salon.ejs to prevent scrolling entirely");
