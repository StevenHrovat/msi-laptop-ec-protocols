# SteelSeries lighting protocol (MSI laptops)

MSI gaming laptops with "SteelSeries" lighting have one or two small lighting
controllers on USB HID. They share one protocol:

| Device | VID:PID | What it drives |
|---|---|---|
| **ALC** (ambient light control) | `1038:113E` | front lightbar ("Aurora" bar), 30 zones on the GE76 |
| **KLC** (keyboard light control) | `1038:113A` | per-key keyboard |

Everything here was measured on an **MSI Raider GE76 12UH** unless a line
says otherwise. Confidence tags:

- **[measured]**: observed on the GE76 with a stopwatch or by eye, repeatable.
- **[decoded]**: follows from vendor captures and agrees with measurements.
- **[earlier source]**: taken from older public documentation, not re-checked here.
- **[open]**: not known yet.

> **Warning: one frame can permanently kill the keyboard backlight.** A `0x0B`
> frame with transition count 0 or total time 0 bricked a GE65 keyboard for
> good ([msi-perkeyrgb #24](https://github.com/Askannz/msi-perkeyrgb/issues/24);
> no BIOS update or reset brought it back). Check every `0x0B` frame before it
> reaches the wire. See [Safety](#safety).

## Transport

- **Control frames:** 524-byte payloads sent with `HidD_SetFeature`
  (Windows: prefix a `0x00` report-id byte, so the buffer is 525 bytes).
  **[decoded]**
- **Finalize frames:** 64-byte payloads sent as an output report
  (`HidD_SetOutputReport`, also with the report-id prefix when the device's
  output report length is 65). **[decoded]**
- A short pause after each write is enough. 3 ms between frames has been
  stable for months; the vendor software uses about 10 ms. **[measured]**
- **No readback.** Every `GetFeature`/`GetInputReport` returns zeros, so the
  controller cannot be asked what it is showing. Software has to remember what
  it sent. **[measured]**
- **The program persists.** Whatever was last programmed survives reboots and
  power cycles, with no explicit "save" command. **[measured]**

## Frame types (byte 0 = opcode)

| Opcode | Size | Meaning |
|---|---|---|
| `0x0B` | 524 | define one **effect slot** (a color animation) |
| `0x0E` | 524 | **region table**: bind zones/keys to effect slots or paint them a static color |
| `0x0C` | 524 | per-key color overlay (KLC, mode `0x66`) |
| `0x09` | 64 | **refresh**: finalize after slots + table (what the vendor sends) |
| `0x0D` | 64 | **commit** `[0D 00 02 …]`: stronger latch, used after static paints |

A complete program is one burst:

1. one `0x0B` per effect slot used,
2. one `0x0E` region table,
3. one finalize frame (`0x09`, or `0x0D` for a static paint).

**The finalize is required.** Without it the new table never shows; the bar
stays black. **[measured]**

## `0x0B` effect slot

All multi-byte values are little-endian.

| Offset | Size | Field |
|---|---|---|
| `0x00` | 1 | `0x0B` |
| `0x01` | 1 | `0x00` |
| `0x02` | 16 × 8 | transition blocks (below); the first block's first byte doubles as the slot id |
| `0x82` | 2 | `00 00` |
| `0x84` | 3 × 2 | start color R, G, B in **register units** (level × 16, 0..4080) |
| `0x8A` | 2 | `FF 00` in every vendor frame |
| `0x8C` | 2 | wave origin X |
| `0x8E` | 2 | wave origin Y |
| `0x90` | 2 | radiate X (1/0) |
| `0x92` | 2 | radiate Y (1/0) |
| `0x94` | 2 | wavelength |
| `0x96` | 1 | transition count (1..16) |
| `0x97` | 1 | `0x00` |
| `0x98` | 2 | total loop length in **ticks** (= sum of the durations) |
| `0x9A` | 1 | wave direction flag |
| rest | | zero |

There is no separate slot-id field: the slot id (0..15) is the index byte of
the first transition block, at offset `0x02`.

### Transition block (8 bytes)

| +0 | +1 | +2 | +3 | +4 | +5 | +6..7 |
|---|---|---|---|---|---|---|
| index (slot id for the first, then 1, 2, 3…) | `00` | rate R | rate G | rate B | `00` | duration in ticks |

### The rate model **[measured]**

This is the key to the whole engine, and older docs get it wrong.

- The controller keeps each channel as a 12-bit **register** value, 16 units
  per 8-bit level (0..4080).
- The R/G/B bytes of a transition are **signed rates**: every tick, the
  controller adds them to the register. They are not "total change" values.
- One **tick is 10 ms** on the GE76 ALC (stopwatch: a 6000-tick loop takes
  60 s). Durations and the total are counted in ticks.
- So a transition changes a channel by `rate × duration` register units, i.e.
  `rate × duration / 16` levels.

Example: the vendor "red alert" slot is `+45 R for 90 ticks, −45 R for 90
ticks, …`. 45 × 90 = 4050 units ≈ 253 levels: a full red flash every 1.8 s.

Consequences:

- The **register carries over between loops**. If a channel's
  `Σ rate × duration` over the loop is not zero, the color drifts every loop
  until it clips at 0 or 4080. Some vendor tables do this slightly (their
  colors wander over minutes). Older notes blamed a firmware "palette
  re-broaden" for this; it's just arithmetic.
- A loop is stable only if **every channel sums to zero** and never leaves
  0..4080 along the way.
- The slowest fade is 1 unit per tick ≈ 6.25 levels per second.
- The fastest is 127 units per tick ≈ 8 levels per tick.
- At most 16 transitions per slot and 65535 ticks (~11 min) per loop.
- A static color is a slot with all rates 0 (and nonzero durations).

### Wave geometry **[measured on the ALC]**

Without wave geometry (radiate X and Y both 0) every zone bound to the slot
shows the same color at the same time ("step" mode).

With radiate X set, every zone plays the same color loop **exactly** (no
extra blending or rainbow), but **delayed in proportion to its distance from
the origin**:

- The bar is a canvas of about **x = 0..1170** (centre 585). Vendor waves use
  origin 585, which starts at the centre and runs out to both corners.
- Delay across the whole bar ≈ **18000 / wavelength** ticks.
- So the palette repeats `(18000 / wavelength) / loop_ticks` times along
  the bar, and a band crosses the bar in `18000 / wavelength` ticks.
- More than ~3 repeats on 30 zones aliases (bands pulse and jump).
- Flag `0x9A`: **0 = bands move toward the origin, 1 = away from it.**
- Origin Y and radiate Y don't matter on the 1-D bar. On the keyboard they
  presumably address a 2-D canvas (vendor keyboard slots use e.g. x 1069,
  y 267). **[open]**

## `0x0E` region table

| Offset | Size | Field |
|---|---|---|
| `0x00` | 1 | `0x0E` |
| `0x01` | 1 | `0x00` |
| `0x02` | 1 | fragment count (up to 42 fit) |
| `0x03` | 1 | `0x00` |
| `0x04` | n × 12 | fragments |

Fragment (12 bytes):

| +0..2 | +3..5 | +6..7 | +8 | +9 | +10 | +11 |
|---|---|---|---|---|---|---|
| base RGB (8-bit) | reactive RGB | reactive time | effect slot id | mode | `00` | zone / region id |

Modes seen: `0` = play the slot, `1` = static base color, `2` = slot (vendor
uses it on some zones), `8` = reactive. **[decoded]**

- Painting a static color = mode 1 with the base RGB, then a `0x0D` commit.
- Region binding and static paint are the same frame type; the last table sent wins.

### The latch law **[measured]**

**A slot that is bound and running ignores redefinition.** Sending a new
`0x0B` for slot 4 while slot 4 is on screen changes nothing. To change an
animation, define it on **fresh slot ids**, then send a table that binds the
zones to the new ids, then finalize. Alternating between two sets of ids
(e.g. 4–9 and 10–15) works well. Slots 0–3 hold the vendor's own effects.

## Host-side animation doesn't work **[measured]**

Streaming frames from the PC (repainting the bar several times a second)
flickers or strobes with every finalize/interval combination tried
(100–200 ms). All motion has to run in the controller's engine; the host
only sends one burst per change.

## Safety

Check every `0x0B` before sending:

- transition count ≥ 1,
- total ticks ≥ 1,
- at least one transition with a nonzero duration.

The vendor software itself sends **fully zeroed** `0x0B` frames (everything
after byte 3 zero) to clear slots on the ALC. That form seems harmless, but
there is no need to ever send one: an unbound slot does nothing.

## Changes compared with earlier documentation

See [effectdoc-corrections.md](effectdoc-corrections.md).
