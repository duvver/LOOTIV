const fs = require('fs');
let code = fs.readFileSync('public/js/okey101.js', 'utf8');

const helpers = `
  function isWild(tile, okeySpec) {
      return !tile.joker && okeySpec && tile.color === okeySpec.color && tile.number === okeySpec.number;
  }
  function getEffectiveTile(tile, okeySpec) {
      if (tile.joker && okeySpec) {
          return { ...tile, color: okeySpec.color, number: okeySpec.number, joker: true };
      }
      return tile;
  }

  function isValidGroupOnClient(tileIds, type) {`;

code = code.replace('  function isValidGroupOnClient(tileIds, type) {', helpers);

fs.writeFileSync('public/js/okey101.js', code);
