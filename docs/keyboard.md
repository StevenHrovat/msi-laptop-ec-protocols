# GE76 keyboard (KLC, `1038:113A`)

Same protocol family as the lightbar ([lighting-protocol.md](lighting-protocol.md)).
The tested keyboard has a US key set (\ above a one-row Enter) **plus the
extra ISO key** (`0x64`), which MSI put in the bottom row between AltGr and Fn.
Other regional layouts will differ in a few keys.

> The brick condition in [lighting-protocol.md § Safety](lighting-protocol.md#safety)
> was first reported on a keyboard controller. Guard every `0x0B`.

## Per-key colors: `0x0C` overlay **[measured]**

| Offset | Size | Field |
|---|---|---|
| `0x00` | 1 | `0x0C` |
| `0x01` | 1 | `0x00` |
| `0x02` | 1 | mode `0x66` (per-key) |
| `0x03` | 1 | `0x00` |
| `0x04` | n × 4 | entries `[key, R, G, B]`, 8-bit colors |

- Fill **every unused entry with `0xFF`**: a zero entry means key `0x00`.
- **Key ids are USB HID keyboard usage ids** (A = `0x04` … Z = `0x1D`,
  Enter = `0x28`, and so on), plus a few vendor ids (below).
- The overlay sits **on top of** the running effect: keys not listed keep
  playing it. To get a fully static keyboard, list every key.
- The overlay persists across reboots.

## Key map

Key ids in physical order, left to right, measured by lighting each id and
watching the keyboard. All values hex. **[measured]**

| Row | Keys (label = id) |
|---|---|
| 1 | Esc 29 · F1–F12 3A–45 · Scroll Lock 47 · Insert 49 · Delete 4C · PrtSc 46 · PgUp 4B · PgDn 4E · Power button 66 |
| 2 | \` 35 · 1–9 1E–26 · 0 27 · - 2D · = 2E · Backspace 2A ‖ Num Lock 53 · / 54 · \* 55 · - 56 |
| 3 | Tab 2B · Q 14 · W 1A · E 08 · R 15 · T 17 · Y 1C · U 18 · I 0C · O 12 · P 13 · [ 2F · ] 30 · \ 31 ‖ 7 5F · 8 60 · 9 61 · + 57 |
| 4 | Caps Lock 39 · A 04 · S 16 · D 07 · F 09 · G 0A · H 0B · J 0D · K 0E · L 0F · ; 33 · ' 34 · Enter 28 ‖ 4 5C · 5 5D · 6 5E |
| 5 | Left Shift E1 · Z 1D · X 1B · C 06 · V 19 · B 05 · N 11 · M 10 · , 36 · . 37 · / 38 · Right Shift E5 · ↑ 52 ‖ 1 59 · 2 5A · 3 5B · Enter 58 |
| 6 | Left Ctrl E0 · Win E3 · Alt E2 · Space 2C · AltGr E6 · \ (ISO key) 64 · Fn F0 · Right Ctrl E4 · ← 50 · ↓ 51 · → 4F ‖ 0 62 · . 63 |

- The ids are the standard USB HID keyboard usages, except **Fn = `F0`**
  (vendor id) and the **power button = `66`** (HID "Keyboard Power").
- The space bar has two LEDs; both follow `2C`.
- Right Shift has two LEDs: the right one is `E5`. The left one's id is
  unknown (not `31`, `32`, `64`, `65` or `E7`). **[open]**
- `32` (the ISO "#" position), `65` and `E7` light nothing on this keyboard.
- Keyboard LEDs render colors differently from the bar: a deep blue like
  `(40, 60, 255)` looks violet. Use white when identifying keys.

## Effects on the keyboard

The KLC also takes `0x0B` slots and `0x0E` region tables: the vendor's
keyboard presets (captured on a GE66) use region tables with 11–42 fragments
and wave origins inside the keyboard area (e.g. x 1069, y 267).
**[earlier source]**

Open on the keyboard: tick length, region ids and the wave canvas. The
timing was deliberately **not** tested here: it would mean sending effect
frames to the keyboard controller, the one the permanent-brick report is about.
If you test it, keep the safety checks on and expect either 10 ms ticks (like
the bar) or milliseconds (as the effectdoc says).
