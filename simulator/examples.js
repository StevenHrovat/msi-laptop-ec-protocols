// Decoded example programs. Format (see README "Program format"):
//   slots: [{ id, start: [r,g,b] levels 0..255, transitions: [[rateR, rateG, rateB, ticks], ...],
//             wave: { originX, wavelength, flag } or null }]
//   zones: one entry per zone (30): a slot id, or "#rrggbb" for a static color;
//          a single value applies to all zones.
//   finalize: "refresh" (0x09, after slots) or "commit" (0x0D, after a static paint)
window.EXAMPLES = [
  {
    name: "Vendor: MSI wave (decoded)",
    note: "The everyday rainbow wave. Six 33-tick steps of ±123 make a full hue wheel; every channel sums to zero, so it never drifts. Bands run out from the centre.",
    slots: [{
      id: 0, start: [255, 0, 0],
      transitions: [[0, 123, 0, 33], [-123, 0, 0, 33], [0, 0, 123, 33], [0, -123, 0, 33], [123, 0, 0, 33], [0, 0, -123, 33]],
      wave: { originX: 585, wavelength: 78, flag: 1 },
    }],
    zones: 0, finalize: "refresh",
  },
  {
    name: "Vendor: red alert (decoded)",
    note: "No wave geometry, so every zone shows the same color: +45 red per tick for 90 ticks (≈253 levels), back down, twice, then a dark pause.",
    slots: [{
      id: 0, start: [0, 0, 0],
      transitions: [[45, 0, 0, 90], [-45, 0, 0, 90], [45, 0, 0, 90], [-45, 0, 0, 90], [0, 0, 0, 90]],
      wave: null,
    }],
    zones: 0, finalize: "refresh",
  },
  {
    name: "Vendor: disco (decoded, two slots)",
    note: "Even zones play slot 2, odd zones slot 0. Slot 2's red channel doesn't sum to zero (−4059 + 4032 = −27 per loop), a tiny vendor drift.",
    slots: [
      {
        id: 0, start: [255, 0, 0],
        transitions: [[-123, 0, 0, 33], [0, 123, 0, 33], [0, -123, 0, 33], [0, 0, 123, 33], [0, 0, -123, 33], [123, 0, 0, 33]],
        wave: { originX: 596, wavelength: 30, flag: 1 },
      },
      {
        id: 2, start: [255, 0, 0],
        transitions: [[-123, 0, 0, 33], [0, 123, 0, 33], [0, -123, 0, 33], [0, 0, 123, 33], [0, 0, -123, 33], [0, 0, 0, 33], [64, 0, 0, 63]],
        wave: { originX: 594, wavelength: 42, flag: 0 },
      },
    ],
    zones: Array.from({ length: 30 }, (_, z) => (z % 2 ? 0 : 2)), finalize: "refresh",
  },
  {
    name: "Custom: ocean flow (stable)",
    note: "Blue to cyan and back with holds. Each fade's rate divides its distance exactly (G ±8 × 128 ticks, B ∓4 × 128), so the loop closes bit-exactly. Wavelength 20 → a band takes 900 ticks to cross, about 2.5 repeats.",
    slots: [{
      id: 4, start: [0, 64, 160],
      transitions: [[0, 8, -4, 128], [0, 0, 0, 50], [0, -8, 4, 128], [0, 0, 0, 50]],
      wave: { originX: 0, wavelength: 20, flag: 1 },
    }],
    zones: 4, finalize: "refresh",
  },
  {
    name: "Mistake: ocean flow that drifts",
    note: "Same as above, but the way back uses G −7 instead of −8. Green gains 128 units (8 levels) every loop and soon clips at 255: the 'palette slowly changes' effect.",
    slots: [{
      id: 4, start: [0, 64, 160],
      transitions: [[0, 8, -4, 128], [0, 0, 0, 50], [0, -7, 4, 128], [0, 0, 0, 50]],
      wave: { originX: 0, wavelength: 20, flag: 1 },
    }],
    zones: 4, finalize: "refresh",
  },
  {
    name: "Custom: centre pulse",
    note: "A white pulse with a black gap. Origin 585 with flag 1 runs from the centre out to both corners; with flag 0 the pulses run inward.",
    slots: [{
      id: 5, start: [0, 0, 0],
      transitions: [[63, 63, 63, 64], [-63, -63, -63, 64], [0, 0, 0, 200]],
      wave: { originX: 585, wavelength: 40, flag: 1 },
    }],
    zones: 5, finalize: "refresh",
  },
  {
    name: "Static paint (no slots)",
    note: "Mode-1 fragments paint fixed colors per zone; a 0x0D commit shows them. No effect slots involved.",
    slots: [],
    zones: Array.from({ length: 30 }, (_, z) => {
      const t = z / 29;
      const h = (n) => Math.round(n).toString(16).padStart(2, "0");
      return "#" + h(255 * (1 - t)) + h(40) + h(255 * t);
    }),
    finalize: "commit",
  },
  {
    name: "DANGER: zero transitions (never send)",
    note: "A 0x0B with transition count 0 and total 0. This is the frame shape that permanently killed a keyboard backlight (msi-perkeyrgb #24). The checks flag it.",
    slots: [{ id: 6, start: [255, 255, 255], transitions: [], wave: null }],
    zones: 6, finalize: "refresh",
  },
];
