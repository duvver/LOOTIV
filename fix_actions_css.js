const fs = require('fs');
const file = 'C:/Users/eness/Desktop/LOOTIV/public/css/turkpoker.css';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /\.action-bar\s*\{[\s\S]*?z-index: 50;\s*\}/,
  `.action-bar {
    position: absolute;
    bottom: 15px;
    left: 5%;
    width: 90%;
    display: flex;
    justify-content: space-between;
    padding: 6px 12px;
    align-items: center;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.3s;
    z-index: 50;
  }
  
  .action-group-left, .action-group-right {
    display: flex;
    gap: 10px;
    align-items: center;
  }`
);

fs.writeFileSync(file, content);
console.log("Updated turkpoker.css action-bar layout");
