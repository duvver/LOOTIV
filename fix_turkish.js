const fs = require('fs');
const file = 'C:/Users/eness/Desktop/LOOTIV/public/js/turkpoker.js';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/>Fold<\/button>/g, '>Pas</button>');
content = content.replace(/>Call \$\{toCall\}<\/button>/g, '>G\u00f6r ${toCall}</button>');
content = content.replace(/>Check<\/button>/g, '>Bop</button>');
content = content.replace(/>Raise<\/button>/g, '>Art\u0131r</button>');
content = content.replace(/>All-in \(\$\{maxBet\}\)<\/button>/g, '>Rest (${maxBet})</button>');
content = content.replace(/>ALL-IN<\/div>/g, '>REST</div>');

fs.writeFileSync(file, content);
console.log("Updated turkpoker.js with Turkish terms");
