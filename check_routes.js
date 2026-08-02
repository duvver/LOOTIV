const fs = require('fs');
const txt = fs.readFileSync('server.js', 'utf8');
const routes = txt.match(/app\.(get|post|delete|put|patch)\(['"`](.*?)['"`]/g);
if (routes) {
  const matching = routes.filter(r => r.toLowerCase().includes('admin') || r.toLowerCase().includes('vip'));
  console.log(matching);
} else {
  console.log('no routes found');
}
