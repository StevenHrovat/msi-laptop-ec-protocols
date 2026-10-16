// Engine model of the SteelSeries lighting controller, as measured on the MSI GE76 lightbar.
// See ../docs/lighting-protocol.md. No dependencies; works in a browser and in Node.
(function (root) {
  "use strict";

  const ZONES = 30;
  const CANVAS = 1170;          // wave canvas width covered by the bar
  const DELAY_CONSTANT = 18000; // delay across the bar = 18000 / wavelength ticks
  const REG_MAX = 4080;         // 12-bit register, 16 units per 8-bit level
  const FRAME = 524;

  const zoneX = (z) => (z * CANVAS) / (ZONES - 1);

  // ------------------------------------------------------------ normalize
  function normalize(program) {
    const slots = (program.slots || []).map((s) => ({
      id: s.id,
      start: s.start.slice(0, 3),
      startReg: s.startReg ? s.startReg.slice(0, 3) : s.start.map((v) => v * 16),
      transitions: s.transitions.map((t) => t.slice(0, 4)),
      total: s.total ?? s.transitions.reduce((a, t) => a + t[3], 0),
      wave: s.wave && s.wave.wavelength > 0 ? { originX: s.wave.originX, wavelength: s.wave.wavelength, flag: s.wave.flag ? 1 : 0 } : null,
    }));
    let zones = program.zones;
    if (!Array.isArray(zones)) zones = Array(ZONES).fill(zones);
    return { name: program.name || "", note: program.note || "", slots, zones: zones.slice(0, ZONES), finalize: program.finalize || (slots.length ? "refresh" : "commit") };
  }

  // ------------------------------------------------------------ checks
  function check(program) {
    const p = normalize(program);
    const out = [];
    const add = (level, text) => out.push({ level, text });
    const ids = new Set(p.slots.map((s) => s.id));
    for (const s of p.slots) {
      const tag = `Slot ${s.id}`;
      const n = s.transitions.length;
      if (n === 0) add("brick", `${tag}: transition count is 0. This can permanently kill a keyboard backlight. Never send.`);
      if (s.total === 0) add("brick", `${tag}: total length is 0. This can permanently kill a keyboard backlight. Never send.`);
      if (n > 0 && s.transitions.every((t) => t[3] === 0)) add("brick", `${tag}: every duration is 0. Never send.`);
      if (n > 16) add("error", `${tag}: ${n} transitions, the controller holds 16.`);
      if (s.id < 0 || s.id > 15) add("error", `${tag}: slot ids are 0..15.`);
      if (s.total > 65535) add("error", `${tag}: loop of ${s.total} ticks exceeds 65535.`);
      for (const t of s.transitions)
        if (t.slice(0, 3).some((r) => r < -128 || r > 127)) { add("error", `${tag}: rates must fit a signed byte (−128..127).`); break; }
      const sum = s.transitions.reduce((a, t) => a + t[3], 0);
      if (n > 0 && s.total !== sum) add("warn", `${tag}: total (${s.total}) differs from the sum of durations (${sum}); the simulator uses the durations.`);
      if (n === 0) continue;
      const drift = [0, 1, 2].map((c) => s.transitions.reduce((a, t) => a + t[c] * t[3], 0));
      const names = ["red", "green", "blue"];
      drift.forEach((d, c) => {
        if (d !== 0) add("warn", `${tag}: ${names[c]} changes by ${d > 0 ? "+" : ""}${d} units (${(d / 16).toFixed(1)} levels) per loop, so the color drifts until it clips.`);
      });
      // clipping during the first loop
      const reg = s.startReg.slice();
      let clipped = false;
      for (const t of s.transitions) for (let k = 0; k < t[3]; k++) for (let c = 0; c < 3; c++) {
        reg[c] += t[c];
        if (reg[c] < 0 || reg[c] > REG_MAX) { clipped = true; reg[c] = Math.min(REG_MAX, Math.max(0, reg[c])); }
      }
      if (clipped) add("warn", `${tag}: a channel hits 0 or 255 during the loop and clips, so the shape is cut off.`);
      if (s.wave && sum > 0) {
        const barDelay = DELAY_CONSTANT / s.wave.wavelength;
        const repeats = barDelay / sum;
        if (repeats > 3.5) add("warn", `${tag}: ${repeats.toFixed(1)} palette repeats on 30 zones; above ~3–4 the bands alias (pulse and jump).`);
        add("info", `${tag}: a band crosses the bar in ${(barDelay / 100).toFixed(1)} s; ${repeats.toFixed(2)} repeats visible.`);
      }
      if (s.id <= 3) add("info", `${tag}: slots 0–3 hold the vendor's effects. Fine to read; for your own programs use fresh ids on every change (a running slot ignores redefinition).`);
    }
    p.zones.forEach((z, i) => {
      if (typeof z === "number" && !ids.has(z)) add("error", `Zone ${i} is bound to slot ${z}, which this program doesn't define.`);
    });
    if (p.zones.length < ZONES) add("warn", `Only ${p.zones.length} zones given; the rest stay dark.`);
    return out;
  }

  // ------------------------------------------------------------ simulation
  // A slot's register value per tick, computed lazily and cached (the register carries over between loops).
  class SlotTrack {
    constructor(slot) {
      this.slot = slot;
      this.hist = [slot.startReg.map((v) => Math.min(REG_MAX, Math.max(0, v)))];
      this.ti = 0; this.tk = 0;
      this.dead = slot.transitions.length === 0 || slot.transitions.every((t) => t[3] === 0);
    }
    at(tick) {
      if (tick < 0) tick = 0;
      if (this.dead) return this.hist[0];
      const tr = this.slot.transitions;
      while (this.hist.length <= tick) {
        while (tr[this.ti][3] === 0) { this.ti = (this.ti + 1) % tr.length; this.tk = 0; }
        const t = tr[this.ti];
        const prev = this.hist[this.hist.length - 1];
        this.hist.push([0, 1, 2].map((c) => Math.min(REG_MAX, Math.max(0, prev[c] + t[c]))));
        if (++this.tk >= t[3]) { this.tk = 0; this.ti = (this.ti + 1) % tr.length; }
      }
      return this.hist[tick];
    }
  }

  class Simulation {
    constructor(program) {
      this.p = normalize(program);
      this.tracks = new Map(this.p.slots.map((s) => [s.id, new SlotTrack(s)]));
      // Start late enough that every zone has a defined past.
      this.offset = Math.ceil(Math.max(0, ...this.p.slots.filter((s) => s.wave).map((s) => DELAY_CONSTANT / s.wave.wavelength)));
    }
    // 8-bit colors of all zones at tick t (t = 0 is when the program was sent)
    colors(t) {
      const out = [];
      for (let z = 0; z < ZONES; z++) {
        const src = this.p.zones[z];
        if (typeof src === "string") { out.push(hex(src)); continue; }
        const track = this.tracks.get(src);
        if (!track) { out.push([0, 0, 0]); continue; }
        const w = track.slot.wave;
        let tick = t + this.offset;
        if (w) {
          const d = Math.round((Math.abs(zoneX(z) - w.originX) * DELAY_CONSTANT) / w.wavelength / CANVAS);
          tick += w.flag ? -d : d; // flag 1: away from the origin (far zones lag); 0: toward it (far zones lead)
        }
        out.push(track.at(tick).map((v) => v >> 4));
      }
      return out;
    }
    // Register values of one slot over its first loop, for plotting
    loop(id) {
      const tr = this.tracks.get(id);
      const n = tr.slot.transitions.reduce((a, t) => a + t[3], 0);
      const fresh = new SlotTrack(tr.slot);
      return Array.from({ length: n + 1 }, (_, i) => fresh.at(i));
    }
  }

  function hex(s) {
    const v = parseInt(s.replace("#", ""), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }

  // ------------------------------------------------------------ frames
  function u16(b, o, v) { b[o] = v & 255; b[o + 1] = (v >> 8) & 255; }

  function encode(program) {
    const p = normalize(program);
    const frames = [];
    for (const s of p.slots) {
      const b = new Uint8Array(FRAME);
      b[0] = 0x0b;
      s.transitions.forEach((t, i) => {
        const o = 0x02 + i * 8;
        b[o] = i === 0 ? s.id : i;
        b[o + 2] = t[0] & 255; b[o + 3] = t[1] & 255; b[o + 4] = t[2] & 255;
        u16(b, o + 6, t[3]);
      });
      if (s.transitions.length === 0) b[2] = s.id;
      for (let c = 0; c < 3; c++) u16(b, 0x84 + c * 2, s.startReg[c]);
      b[0x8a] = 0xff;
      if (s.wave) { u16(b, 0x8c, s.wave.originX); b[0x90] = 1; u16(b, 0x94, s.wave.wavelength); b[0x9a] = s.wave.flag; }
      b[0x96] = s.transitions.length;
      u16(b, 0x98, s.total);
      frames.push({ kind: "feature", bytes: b });
    }
    const b = new Uint8Array(FRAME);
    b[0] = 0x0e; b[2] = ZONES;
    p.zones.forEach((src, z) => {
      const o = 4 + z * 12;
      if (typeof src === "string") { const c = hex(src); b[o] = c[0]; b[o + 1] = c[1]; b[o + 2] = c[2]; b[o + 9] = 1; }
      else b[o + 8] = src;
      b[o + 11] = z;
    });
    frames.push({ kind: "feature", bytes: b });
    const f = new Uint8Array(64);
    if (p.finalize === "commit") { f[0] = 0x0d; f[2] = 0x02; } else f[0] = 0x09;
    frames.push({ kind: "output", bytes: f });
    return frames;
  }

  function decode(frames) {
    const slots = [];
    let zones = Array(ZONES).fill("#000000");
    let finalize = null;
    const notes = [];
    const s8 = (x) => (x > 127 ? x - 256 : x);
    const r16 = (b, o) => b[o] | (b[o + 1] << 8);
    for (const b of frames) {
      if (b[0] === 0x0b) {
        const n = b[0x96];
        const transitions = [];
        for (let i = 0; i < n && i < 16; i++) { const o = 0x02 + i * 8; transitions.push([s8(b[o + 2]), s8(b[o + 3]), s8(b[o + 4]), r16(b, o + 6)]); }
        const startReg = [0, 1, 2].map((c) => r16(b, 0x84 + c * 2));
        const radX = b[0x90], wl = r16(b, 0x94);
        slots.push({
          id: b[2], startReg, start: startReg.map((v) => v >> 4), transitions, total: r16(b, 0x98),
          wave: radX && wl ? { originX: r16(b, 0x8c), wavelength: wl, flag: b[0x9a] } : null,
        });
      } else if (b[0] === 0x0e) {
        zones = Array(ZONES).fill("#000000");
        for (let i = 0; i < b[2]; i++) {
          const o = 4 + i * 12, z = b[o + 11];
          if (z >= ZONES) continue;
          zones[z] = b[o + 9] === 1 ? "#" + [b[o], b[o + 1], b[o + 2]].map((v) => v.toString(16).padStart(2, "0")).join("") : b[o + 8];
        }
      } else if (b[0] === 0x09) finalize = "refresh";
      else if (b[0] === 0x0d) finalize = "commit";
      else notes.push(`Frame with opcode 0x${b[0].toString(16).padStart(2, "0")} ignored.`);
    }
    if (!finalize) notes.push("No finalize frame (0x09 or 0x0D): on the real bar the new table would not show.");
    return { program: { name: "Decoded frames", slots, zones, finalize: finalize || "refresh" }, notes };
  }

  function toHex(frames) {
    return frames.map((f) => {
      let end = f.bytes.length;
      while (end > 1 && f.bytes[end - 1] === 0) end--;
      return Array.from(f.bytes.slice(0, end), (v) => v.toString(16).padStart(2, "0")).join(" ");
    }).join("\n");
  }

  function parseHex(text) {
    return text.split(/\n+/).map((l) => l.trim()).filter(Boolean).map((line) => {
      const bytes = line.replace(/0x/gi, "").split(/[\s,]+/).filter(Boolean).map((h) => parseInt(h, 16));
      if (bytes.some(isNaN)) throw new Error("not hex: " + line.slice(0, 40));
      const size = bytes[0] === 0x09 || bytes[0] === 0x0d ? 64 : FRAME;
      const b = new Uint8Array(Math.max(size, bytes.length));
      b.set(bytes);
      return b;
    });
  }

  root.Engine = { ZONES, CANVAS, DELAY_CONSTANT, REG_MAX, normalize, check, Simulation, encode, decode, toHex, parseHex };
  if (typeof module !== "undefined") module.exports = root.Engine;
})(typeof window !== "undefined" ? window : globalThis);
