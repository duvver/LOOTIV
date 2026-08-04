// Shared Sound Engine for all LOOTIV games
const LootivSound = (() => {
  let audioCtx = null;
  function getCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }
  function play(type) {
    const ctx = getCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    switch(type) {
      case 'deal':
        osc.type='triangle'; osc.frequency.setValueAtTime(150,ctx.currentTime); osc.frequency.exponentialRampToValueAtTime(40,ctx.currentTime+0.1); gain.gain.setValueAtTime(0.5,ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01,ctx.currentTime+0.1); osc.start(); osc.stop(ctx.currentTime+0.1); break;
      case 'chip':
        osc.type='sine'; osc.frequency.setValueAtTime(3000,ctx.currentTime); osc.frequency.exponentialRampToValueAtTime(1000,ctx.currentTime+0.1); gain.gain.setValueAtTime(0.3,ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01,ctx.currentTime+0.1); osc.start(); osc.stop(ctx.currentTime+0.1); break;
      case 'win':
        osc.type='square'; osc.frequency.setValueAtTime(400,ctx.currentTime); osc.frequency.setValueAtTime(600,ctx.currentTime+0.15); osc.frequency.setValueAtTime(800,ctx.currentTime+0.3); gain.gain.setValueAtTime(0.2,ctx.currentTime); gain.gain.linearRampToValueAtTime(0,ctx.currentTime+0.6); osc.start(); osc.stop(ctx.currentTime+0.6); break;
      case 'tile': // For Okey games
        osc.type='sine'; osc.frequency.setValueAtTime(800,ctx.currentTime); osc.frequency.exponentialRampToValueAtTime(400,ctx.currentTime+0.08); gain.gain.setValueAtTime(0.4,ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01,ctx.currentTime+0.08); osc.start(); osc.stop(ctx.currentTime+0.08); break;
      case 'notify':
        osc.type='sine'; osc.frequency.setValueAtTime(523,ctx.currentTime); osc.frequency.setValueAtTime(659,ctx.currentTime+0.1); gain.gain.setValueAtTime(0.3,ctx.currentTime); gain.gain.linearRampToValueAtTime(0,ctx.currentTime+0.3); osc.start(); osc.stop(ctx.currentTime+0.3); break;
    }
  }
  return { play };
})();
