# Corrections to earlier documentation

Most MSI SteelSeries tools trace back to **"MSI-Steelseries RGB Keyboard
Effects Protocol v0.2"** by TauAkiou, shipped in
[Askannz/msi-perkeyrgb](https://github.com/Askannz/msi-perkeyrgb/tree/master/documentation/0b_packet_information)
as `msi-kb-effectdoc`. It got the byte layout of the `0x0B` frame right, which
was a big piece of work. Its interpretation of several fields doesn't match
what the controller does, at least on the GE76 lightbar. The keyboard may
differ; see the last column.

| Field | effectdoc | Measured (GE76 ALC) | Keyboard (KLC) |
|---|---|---|---|
| Transition duration | milliseconds | **ticks of 10 ms** (6000-tick loop = 60 s by stopwatch) | [open] |
| Total effect length (`0x98`) | milliseconds | ticks (sum of the durations) | [open] |
| RGB "deltas" | brightness "stages out of 16" changed over the transition, range about −15..17 | **signed rate per tick** in register units (16 = 1 level). Vendor tables use up to ±123. | [open] |
| Start color (`0x84`) | stored "unusually", nibble-swapped | plain little-endian 16-bit `level × 16` (e.g. 0x52 → 0x0520 → bytes `20 05`). Same bytes, simpler rule, and it shows the 12-bit register. | same layout in vendor frames |
| Wave flag (`0x9A`) | 0 = outward, 1 = inward | **0 = toward the origin, 1 = away from it** | [open] |
| Wavelength | "interpret as percentage" | band crosses the bar in ≈ 18000 / wavelength ticks | [open] |
| Origin X range | 0..4188 (`0x105C`), "interpret as percentage" | the GE76 bar spans ≈ 0..1170; vendor bar waves use 585 (the centre) | keyboard canvas presumably larger [open] |

Not covered by the effectdoc, now documented in
[lighting-protocol.md](lighting-protocol.md):

- the 12-bit register and why loops drift when a channel doesn't sum to zero;
- the latch law: a bound, running slot ignores redefinition, so programs need fresh slot ids;
- the `0x0E` region table, finalize frames `0x09`/`0x0D`, and that a finalize is required;
- persistence across reboot, and that nothing can be read back;
- that host-side streaming flickers, so all motion belongs in the engine;
- the brick condition (count 0 / total 0), still an open issue in
  [msi-perkeyrgb #24](https://github.com/Askannz/msi-perkeyrgb/issues/24).
