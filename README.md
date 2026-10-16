# MSI laptop EC & lighting protocols

Protocol notes for the controllers in an **MSI Raider GE76** (12th gen),
measured on real hardware, plus a **simulator** for the front lightbar so you
can try effect programs without touching a laptop.

Written by **Claude Opus 5.5** (Anthropic's AI model) while building a
Windows tray app for this laptop together with Steven Hrovat, who ran every
hardware test. The older public
documentation got the byte layout right but the timing and color model
wrong, which cost a lot of trial and error. This repo is meant to spare the
next person that.

| Controller | Interface | Doc |
|---|---|---|
| Front lightbar (SteelSeries ALC, `1038:113E`) | USB HID | [docs/lighting-protocol.md](docs/lighting-protocol.md), [docs/lightbar.md](docs/lightbar.md) |
| Per-key keyboard (SteelSeries KLC, `1038:113A`) | USB HID | [docs/keyboard.md](docs/keyboard.md) |
| Fans, temperatures, Cooler Boost (ACPI EC) | port I/O `0x62`/`0x66` | [docs/fan-ec.md](docs/fan-ec.md) |

What's different from the effectdoc most tools are based on:
[docs/effectdoc-corrections.md](docs/effectdoc-corrections.md).

> **Warning.** One malformed lighting frame (an effect with zero transitions
> or zero total time) can permanently disable a keyboard backlight. Writing
> wrong values to the EC can affect cooling. Eco mode and Super Battery made
> the firmware brake the CPU to 0.4 GHz on this laptop. Heavy EC polling on Windows can
> make Windows misread the battery and shut down (see
> [fan-ec.md](docs/fan-ec.md#windows-talks-to-the-ec-at-the-same-time-measured)). Everything here is provided as
> is, without any warranty; use it at your own risk.

## The short version

- Effect slots (`0x0B`) are **rate programs**: each transition adds a signed
  rate to a 12-bit color register (16 units = 1 level) **every 10 ms tick**,
  for a number of ticks.
- If a channel's rates don't sum to zero over the loop, the color **drifts**
  every loop until it clips.
- Wave mode delays each zone by its distance from the origin: the delay across
  the bar is about `18000 / wavelength` ticks.
- A **running slot ignores redefinition**: use fresh slot ids and rebind the zones with a `0x0E` table.
- Always end with a finalize frame (`0x09` or `0x0D`), or nothing shows.
- Programs persist across reboot. Nothing can be read back.

## Simulator

Open [`simulator/index.html`](simulator/index.html) in a browser (no build, no
server needed). It:

- plays a program on a 30-zone bar with the measured timing, wave delays and a
  frosted-diffuser look;
- decodes pasted frames (hex, one frame per line, trailing zeros optional) and
  encodes programs back into frames;
- runs the safety checks: brick condition, drift per loop, clipping, aliasing,
  slot ids.

### Program format

```json
{
  "slots": [
    {
      "id": 4,
      "start": [0, 64, 160],
      "transitions": [[0, 8, -4, 128], [0, 0, 0, 50], [0, -8, 4, 128], [0, 0, 0, 50]],
      "wave": { "originX": 0, "wavelength": 20, "flag": 1 }
    }
  ],
  "zones": 4,
  "finalize": "refresh"
}
```

- `start`: 8-bit levels (the frame stores level × 16).
- `transitions`: `[rateR, rateG, rateB, ticks]`, rates −128..127 register units per tick.
- `wave`: `null` for no wave (all zones in step). `flag` 1 = bands move away from the origin, 0 = toward it.
- `zones`: one entry per zone (30), either a slot id or `"#rrggbb"` for a static color.
  A single value applies to every zone.

`simulator/engine.js` has no dependencies and also runs in Node
(`require("./simulator/engine.js")`), if you want the encoder and checks in a tool.

## Status

Measured on one GE76 Raider 12UH. Other MSI models with SteelSeries lighting
(GE66, GE65, GS65, GP66…) use the same protocol family as far as public
reports show, but zone counts, key maps and EC registers differ.
Reports from other models are welcome as issues.

Open questions are listed at the end of each doc.

## Credits

- TauAkiou's *MSI-Steelseries RGB Keyboard Effects Protocol* in
  [Askannz/msi-perkeyrgb](https://github.com/Askannz/msi-perkeyrgb): the
  original `0x0B` byte layout.
- [luisalbertopm/msi-ge66-raider-rgb](https://github.com/luisalbertopm/msi-ge66-raider-rgb):
  vendor frames for the GE66 lightbar and keyboard.
- [PawnIO](https://pawnio.eu/): signed port-I/O driver used for EC access on Windows.

## License

[MIT](LICENSE).
