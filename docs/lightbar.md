# GE76 front lightbar (ALC, `1038:113E`)

The protocol is in [lighting-protocol.md](lighting-protocol.md). This page is
about the bar itself.

## Zones **[measured]**

- **30 zones**, ids `0x00`–`0x1D`, left to right across the whole bar
  (seen from the front). Ids 30–54 are accepted but light nothing.
- The vendor region table has 30 fragments, one per zone, in the same order.
  Zones `0x00`–`0x0E` are the left half, `0x0F`–`0x1D` the right half.
- On the wave canvas the bar spans about x = 0..1170, so zone *z* sits near
  `x = z × 1170 / 29`.

## What the bar looks like

- Point LEDs behind a frosted plastic strip that is visible over about 270°.
  Each LED shows a fainter echo on its neighbours, so neighbouring zones blend.
  A preview that matches the real bar blends each zone with its neighbours
  (weights roughly 0.10, 0.22, 1, 0.22, 0.10) and blurs a little.
- The bar wraps around both front corners: a lit end zone also glows faintly
  at the other end.
- Fine per-zone detail (scattered sparkles, single-zone flickers) is lost in
  the frosting. Broad, smooth shapes and travelling bands read well.
- It is dimmer than a monitor suggests: full brightness looks like about 65 %
  of the same color on screen, 50 % like about 30 %.
- "Off" parts of a pattern should be true black: a 12–18 % background reads
  as an unwanted glow.

## Timing **[measured]**

- 1 tick = 10 ms.
- Example: wavelength 18 with a 1000-tick loop gives a band that crosses the
  bar in 18000 / 18 = 1000 ticks = 10 s, one palette repeat on the bar.

## Corner overlay **[earlier source, partly measured]**

`0x0C` with mode `0x06` (the keyboard overlay format, 4-byte
`[index, R, G, B]` entries, unused entries `0xFF`) latches on the ALC but only
covers roughly the left quarter of the bar (zones ≈ 0–13).

## Vendor programs (decoded)

The vendor software sends the burst
`0x0B` slots → `0x0E` table → `0x09` refresh. See `examples/` for decoded
tables. The everyday "wave" is a single slot:

| Field | Value | Meaning |
|---|---|---|
| start | 4080, 0, 0 | full red |
| transitions | `G+123`, `R−123`, `B+123`, `G−123`, `R+123`, `B−123`, 33 ticks each | a hue wheel: red → yellow → green → cyan → blue → magenta → red |
| total | 198 ticks | 1.98 s per loop |
| origin / wavelength | 585 / 78 | from the centre; bar delay 18000 / 78 ≈ 231 ticks ≈ 1.2 palette repeats |
| flag | 1 | bands move away from the centre |

123 × 33 = 4059 units ≈ 254 levels per step, and every channel sums to
zero, so the loop is perfectly stable.
