import re

with open(r'public\js\okey101.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Add the Geri Birak button
ui_old = """          if (mySeat && !mySeat.hasOpened) {
            parts.push(<div class="okey-hint">Gruplarini bosluklarla ayirip ac; ya da tasini sag kosene surukleyip at.
</div>);"""
ui_new = """          if (mySeat && !mySeat.hasOpened) {
            if (mySeat.mustOpenThisTurn) {
                parts.push(<button type="button" class="action-btn action-fold" id="okey101-undo-draw-btn">Tasi Geri Birak</button>);
            }
            parts.push(<div class="okey-hint">Gruplarini bosluklarla ayirip ac; ya da tasini sag kosene surukleyip at.
</div>);"""
content = content.replace(ui_old, ui_new)

# Add the event listener for Geri Birak
evt_old = """      document.getElementById('okey101-open-seri-btn')?.addEventListener('click', () => {"""
evt_new = """      document.getElementById('okey101-undo-draw-btn')?.addEventListener('click', () => {
        socket.emit('okey101:undoDraw');
      });
      document.getElementById('okey101-open-seri-btn')?.addEventListener('click', () => {"""
content = content.replace(evt_old, evt_new)

# Add calculateRackScore function
calc_func = """
function calculateRackScore(okeySpec) {
  const groups = extractRackGroups(3);
  let seriTotal = 0;
  for (const g of groups) {
    const tiles = g.map(id => rackLayout.find(t => t && t.id === id));
    if (tiles.some(t => !t)) continue;
    const wilds = tiles.filter(t => t.joker || (okeySpec && t.color === okeySpec.color && t.number === okeySpec.number));
    const normals = tiles.filter(t => !t.joker && !(okeySpec && t.color === okeySpec.color && t.number === okeySpec.number));
    if (normals.length === 0) continue;
    
    // Per check
    const isPer = normals.every(t => t.number === normals[0].number) && new Set(normals.map(t => t.color)).size === normals.length;
    if (isPer && tiles.length <= 4) {
        seriTotal += normals[0].number * tiles.length;
        continue;
    }
    
    // Seri check
    if (normals.every(t => t.color === normals[0].color)) {
        const nums = normals.map(t => t.number).sort((a,b) => a-b);
        let valid = true;
        for (let i=1; i<nums.length; i++) if (nums[i] === nums[i-1]) valid = false;
        if (valid) {
            let lo = nums[0];
            let hi = nums[nums.length-1];
            let freeWilds = wilds.length;
            const span = hi - lo + 1;
            const gaps = span - nums.length;
            if (gaps <= freeWilds) {
                freeWilds -= gaps;
                while (freeWilds > 0 && hi < 13) { hi++; freeWilds--; }
                while (freeWilds > 0 && lo > 1) { lo--; freeWilds--; }
                if (freeWilds === 0) {
                    seriTotal += ((lo + hi) * (hi - lo + 1)) / 2;
                }
            }
        }
    }
  }
  
  let badge = document.getElementById('rack-score-badge');
  if (!badge) {
      badge = document.createElement('div');
      badge.id = 'rack-score-badge';
      badge.className = 'rack-score-badge';
      const rackZone = document.querySelector('.ok1-rackzone');
      if (rackZone) rackZone.appendChild(badge);
  }
  if (badge) {
      badge.innerHTML = Seri Puani: <strong></strong>;
  }
}
"""

if "calculateRackScore" not in content:
    content = content + "\n" + calc_func

# Inject calculateRackScore into renderRack()
ren_old = """function renderRack() {
  const rackEl = document.getElementById('okey-rack');
  if (!rackEl) return;
  rackEl.innerHTML = '';"""
ren_new = """function renderRack() {
  const rackEl = document.getElementById('okey-rack');
  if (!rackEl) return;
  rackEl.innerHTML = '';
  if (typeof lastState !== 'undefined' && lastState) calculateRackScore(lastState.okeySpec);"""
content = content.replace(ren_old, ren_new)

with open(r'public\js\okey101.js', 'w', encoding='utf-8') as out:
    out.write(content)
print("okey101.js patched.")

with open(r'public\css\okey101.css', 'a', encoding='utf-8') as css:
    css.write("\n.rack-score-badge {\n  position: absolute;\n  top: 10px;\n  left: 10px;\n  background: rgba(0,0,0,0.6);\n  color: #fff;\n  padding: 5px 10px;\n  border-radius: 6px;\n  font-size: 14px;\n  z-index: 100;\n}\n.ok1-rackzone {\n  position: relative;\n}\n")
print("okey101.css patched.")
