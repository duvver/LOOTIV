const Item = require('./Item');

class Belt extends Item {
  get currentAttributes() {
    const attrs = { ...this.baseAttributes };

    // Each upgrade level increases base defense and HP by a percentage or flat amount
    if (attrs.defense !== undefined) {
      attrs.defense = Number(attrs.defense) + (this.upgradeLevel * 2);
    }

    if (attrs.hp !== undefined) {
      attrs.hp = Number(attrs.hp) + (this.upgradeLevel * 20);
    }

    return attrs;
  }
}

module.exports = Belt;
