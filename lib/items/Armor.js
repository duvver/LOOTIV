const Item = require('./Item');

class Armor extends Item {
  get currentAttributes() {
    const attrs = { ...this.baseAttributes };

    // Each upgrade level increases defense heavily
    if (attrs.defense !== undefined) {
      attrs.defense = Number(attrs.defense) + (this.upgradeLevel * 4);
    }

    return attrs;
  }
}

module.exports = Armor;
