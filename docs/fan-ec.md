# Fan control: the embedded controller (EC)

Fans, temperatures and Cooler Boost live in the laptop's ACPI embedded
controller. Measured on an **MSI Raider GE76 12UH, EC firmware
`17K4EMS1.107`**. Register maps differ between MSI models and EC firmware
versions: read the firmware string (`0xA0`) first and compare a full dump with
this table before writing anything.

## Access

- The EC sits behind the standard ACPI EC ports: **`0x62` data,
  `0x66` command/status**.
- On Windows a signed driver is needed for port I/O. This was done with
  [PawnIO](https://pawnio.eu/) and its `LpcACPIEC` module (the same route Fan
  Control and LibreHardwareMonitor use). Admin rights are required.
- Standard ACPI handshake:
  - **read:** wait until input buffer empty (status bit 1 = 0), write `0x80` to
    `0x66`, wait, write the register to `0x62`, wait until output full
    (status bit 0 = 1), read `0x62`;
  - **write:** `0x81` to `0x66`, register to `0x62`, value to `0x62`, waiting
    for input-buffer-empty before each byte.
- Tools coordinate through the named mutex `Global\Access_EC`.

### Windows talks to the EC at the same time **[measured]**

Windows' own ACPI driver uses the EC concurrently and ignores that mutex.
There is no lock a user-mode tool can share with it, so transactions can
interleave: a tool can read a byte meant for Windows (seen: stray `0x90` and
`0x00`), and, worse, **Windows can read a byte corrupted by the tool**.

> **Warning: heavy polling can make Windows misread the battery and shut down.**
> Reading all 256 registers every second (about 600 EC transactions per
> second) made Windows log *Critical Battery Trigger Met* within 23 s while the
> battery was at 95 % on AC. It hibernated for "battery", resumed, and powered
> off shortly after. Windows reads the battery through the same two ports.
> Keep EC traffic low: read only the registers you need, no full-EC polling
> loops, and full dumps only on demand.

What works:

- **don't take a byte that may be Windows'.** If the output buffer is full
  when you want to start, its owner is usually mid-transaction: wait (we use up
  to 20 ms) for it to be collected, and only discard a byte nobody wants by
  then. Draining it straight away steals the answer to Windows' read;
- for finding switches, take one dump before and one after an action instead
  of polling, then re-read the changed registers to drop strays;
- write only bytes that actually change, with a short pause between them:
  Windows logs ACPI event 15 ("The embedded controller returned data when
  none was requested") during write bursts;
- read every register twice and accept the value only when both agree (a
  third read decides otherwise);
- reject impossible values (temperatures outside 15–110 °C, fan % above 128);
- after every write, read the register back and retry on mismatch.

## Register map (GE76 12UH, `17K4EMS1.107`) **[measured]**

| Register | Meaning | Example |
|---|---|---|
| `0x2E` bit 1 | **webcam** on (Fn+F4 toggles it) | `0x1B` on, `0x19` off |
| `0x30` bit 0 | AC adapter connected | `0x03` on AC, `0x02` on battery |
| `0x68` | CPU temperature °C | 48 |
| `0x6A`–`0x6F` | CPU curve: 6 temperature thresholds °C | 50 56 62 70 75 80 |
| `0x71` | CPU fan **target** % from the curve (ignores Cooler Boost; use the tachometer for real speed) | 40 |
| `0x72`–`0x78` | CPU curve: 7 fan speeds % | 0 40 49 58 67 76 85 |
| `0x7A`–`0x7F` | CPU curve: 6 hysteresis values °C | 10 7 7 9 9 9 |
| `0x80` | GPU temperature °C | 47 |
| `0x82`–`0x87` | GPU curve thresholds °C | 55 60 65 70 75 80 |
| `0x89` | GPU fan target % | 0 |
| `0x8A`–`0x90` | GPU curve speeds % | 0 48 56 64 72 79 86 |
| `0x92`–`0x97` | GPU curve hysteresis °C | 10 7 6 6 6 6 |
| `0x98` bit 7 | **Cooler Boost**, fans to max (Fn+F8 toggles it) | `0x02` off, `0x82` on |
| `0xA0`–`0xAB` | EC firmware string (ASCII) | `17K4EMS1.107` |
| `0xC8`–`0xC9` | CPU fan tachometer, big-endian; rpm = 478000 / raw | 227 → 2105 rpm |
| `0xCA`–`0xCB` | GPU fan tachometer (same formula; 0 = stopped) | 0 |
| `0xD2` | shift mode: `C1` comfort (default), `C4` turbo, `C2` eco (**see warning**) | `C1` |
| `0xD3` | keyboard backlight level, `0x80` + 0..3 (Fn+F10 / Fn+F11) | `0x83` |
| `0xD4` | fan mode: `0D` auto, `1D` silent, `8D` advanced | `0D` |
| `0xD7` | **battery charge limit**: `0x80` + stop percent; charging resumes 10 % below (verified: stopped at exactly 80 %) | `0xD0` = 80 % |
| `0xD8` | code of the last Fn hotkey pressed (changes with every Fn key) | |
| `0xE8` bit 4 | **Fn/Win key swap** (works, although Fn sits on the right on this model) | `0x00` |
| `0xEB` low nibble | Super Battery flag (**see warning**) | `0x00` |

Battery status bytes around `0x31`, `0x42`–`0x4B` change with charging and
discharge current; not decoded further.

### Fn keys (GE76 12UH)

Measured by taking an EC dump before and after each key:

| Key | Icon | EC effect |
|---|---|---|
| Fn+F2 | display switch | `0x34`, `0xFE` 00 → 01 (unclear) |
| Fn+F3 | touchpad on/off | none: handled outside the EC |
| Fn+F4 | webcam | `0x2E` bit 1 |
| Fn+F5 | airplane mode | none |
| Fn+F6 | crosshair | only `0xD8` (hotkey code) |
| Fn+F7 | MSI "G" (MSI Center) | only `0xD8` |
| Fn+F8 | fan | `0x98` bit 7, Cooler Boost |
| Fn+F9 | SteelSeries | only `0xD8` |
| Fn+F10 / F11 | keyboard brightness up / down | `0xD3` ± 1 |
| Fn+F12 | none (unlabelled, not lit with Fn) | `0xF0` 00 → 20, no visible function |

### Curve semantics

Below threshold 1 the fan runs at speed 1. From threshold *i* on, it runs
at speed *i + 1*. It steps back down only when the temperature drops
*hysteresis i* °C below threshold *i*.

## Writing a custom curve **[measured]**

1. Write the 6 thresholds and 7 speeds for CPU and GPU (write only bytes that
   change). The hysteresis registers were left untouched.
2. The EC follows the table **in auto mode too**: with fan mode `0D`, raising
   the GPU's lowest step from 0 to 20 % started the stopped GPU fan at once.
   MSI's own software additionally sets `0xD4` = `0x8D` (advanced).
3. Cooler Boost: set or clear **only bit 7** of `0x98` (read-modify-write).

Sanity rules used before any write (choices, not EC limits): thresholds 30–100 °C and
strictly rising, speeds 0–150 % and never dropping, at least 50 % from 75 °C,
last step at least 75 %. Save the factory table from a fresh read before the
first write; it isn't stored anywhere else.

## What survives sleep and reboot **[measured]**

| | after hibernate | after a full reboot |
|---|---|---|
| fan curves | reset to factory | reset to factory |
| fan mode (`0xD4`) | back to `0D` auto | back to `0D` auto |
| shift mode (`0xD2`) | | back to `C1` comfort |
| charge limit (`0xD7`) | | **kept** |

A tool with custom curves or a non-default shift mode has to re-apply them
after every resume and at startup.

## Warning: Eco and Super Battery brake the CPU to 0.4 GHz **[measured]**

On the GE76 12UH both **shift mode `0xC2` (eco)** and **Super Battery**
(`0xEB` low nibble = `0x0F`) made the firmware hold the CPU at about
**0.4 GHz**. Windows logged *"the speed of processor N is being limited by
system firmware"* (Kernel-Processor-Power event 37) about a minute later and
became nearly unusable; even the tool's own window could hardly react, and a
tool that re-applies the setting at startup brings the brake back after a
reboot.

Getting out: clear the `0xEB` low nibble **first**, then write shift mode
`0xC1`. The clock returned to normal right after `0xC1` was written (once
after a waiting rescue tool finally got the EC). If you offer these modes at
all, make the way back independent of the UI: a command line switch, or a
watchdog that checks for event 37 and falls back to `0xC1`.

## Open questions

- What exactly releases the brake: on one occasion it lifted when a different
  mode changed the fan table without touching `0xD2`. **[open]**
