#!/usr/bin/env python3
"""Underlight: an original looping exploration theme for Lanternfall.

Someone walks into the dark with a lantern. A soft electric-piano ostinato (3+3+2 over wide
leaps) keeps the feet moving the whole time; over it a wordless, whistle-like voice sings a
theme built from one rising call (long, short, short, long) that climbs a third each time it
is asked again. No drums: the push comes from a plucked bass and, later, low spiccato strings.

    key D minor, coloured by a Lydian Bb, a Neapolitan Eb and a dim7 on A
    eighth note 0.279 s (107.5 BPM), 4/4, 36 bars = 80.4 s, loops seamlessly

    A  0:00  keys alone over a low string drone; a music box hints at the theme
    B  0:18  the theme: solo voice, plucked bass, string pad, harp glints
    C  0:36  the cavern opens: three interlocking arpeggio lines, choir and high strings
    D  0:54  the theme again, fuller: voice + strings in octaves + music box, spiccato celli
    E  1:11  four bars thinning back to the keys

Instruments are synthesized from scratch: FM electric piano, modal plucked string, additive
string ensemble and choir shaped by body/vowel formants, a legato solo voice with glide and
delayed vibrato, a glass music box, sub bass.

Renders content/audio/music/underlight.ogg (Vorbis q6). Needs numpy and ffmpeg.

    python3 tools/audio/underlight.py [--seed N] [--wav PATH]
"""
import os
import subprocess
import sys
import tempfile
import wave

import numpy as np

SR = 44100
STEP = 0.279                 # one eighth note
BAR = 8 * STEP
BARS = 36
N = int(round(BARS * BAR * SR))
TAIL = 9 * SR
TOTAL = N + TAIL


def arg(name, default=None):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


seed = int(arg("--seed", 1977))
rng = np.random.default_rng(seed)

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "content", "audio", "music", "underlight.ogg")


# ---------- dsp helpers ----------

def mtof(m):
    return 440.0 * 2 ** ((np.asarray(m, float) - 69) / 12)


def fft_filter(x, lo=None, hi=None):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    g = np.ones_like(f)
    if hi:
        g /= np.sqrt(1 + (f / hi) ** 4)
    if lo:
        g /= np.sqrt(1 + (lo / np.maximum(f, 1e-3)) ** 4)
    return np.fft.irfft(X * g, len(x))


def fb_delay(x, d, fb):
    y = np.concatenate([np.zeros(d), x])[:len(x)]
    for i in range(d, len(y), d):
        seg = y[i:i + d]
        seg += fb * y[i - d:i - d + len(seg)]
    return y


def reverb(x, secs, seed_off, hi=4500):
    n = int(secs * SR)
    t = np.arange(n) / SR
    r = np.random.default_rng(seed + seed_off)
    ir = r.standard_normal(n) * np.exp(-6.9 * t / secs)
    ir = fft_filter(ir, lo=180, hi=hi)
    ir *= np.clip((t - 0.02) / 0.03, 0, 1)
    ir /= np.sqrt(np.sum(ir ** 2))
    size = 1 << int(np.ceil(np.log2(len(x) + n)))
    return np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(ir, size), size)[:len(x)]


def gauss(f, c, w):
    return np.exp(-((f - c) / w) ** 2)


class Bus:
    def __init__(self):
        self.l = np.zeros(TOTAL)
        self.r = np.zeros(TOTAL)

    def add(self, t, y, pan=0.0):
        """y is mono (panned) or an (l, r) pair."""
        l, r = (y[0], y[1]) if isinstance(y, tuple) else (y * (1 - pan), y * (1 + pan))
        s = max(0, int(round(t * SR)))
        e = min(s + len(l), TOTAL)
        if e > s:
            self.l[s:e] += l[:e - s]
            self.r[s:e] += r[:e - s]


def hum(ms=5):
    return float(rng.normal(0, ms / 1000))


# ---------- instruments ----------

def epiano(m, vel, length=2.4):
    """FM electric piano: a tine 'ting' that melts into a round bark-less tone; two detuned
    voices, one per side."""
    f0 = float(mtof(m))
    n = int(length * SR)
    t = np.arange(n) / SR
    tau = float(np.clip(1.0 * (260 / f0) ** 0.35, 0.45, 1.5))
    amp = np.clip(t / 0.004, 0, 1) * np.exp(-t / tau) * np.clip((length - t) / 0.25, 0, 1)
    idx = (0.6 + 2.0 * vel) * min(1.0, (330 / f0) ** 0.6) * (0.25 + 0.75 * np.exp(-t / 0.35))
    out = []
    for cents in (-3.0, 3.5):
        f = f0 * 2 ** ((cents + rng.uniform(-2, 2)) / 1200)
        w = 2 * np.pi * f * t
        y = np.sin(w + idx * np.sin(w + 0.3))
        if 15 * f0 < 11000:   # tine partials
            y += 0.32 * vel * np.exp(-t / 0.09) * np.sin(w + 0.9 * np.exp(-t / 0.06) * np.sin(14 * w))
        y += 0.10 * np.sin(2 * w) * np.exp(-t / 0.2)
        out.append(y * amp * vel)
    return 0.8 * out[0] + 0.2 * out[1], 0.2 * out[0] + 0.8 * out[1]


def pluck(m, vel, length=2.0, pos=0.19, d0=1.4, fmax=7000):
    """Modal plucked string: every partial has its own decay, slightly stretched tuning."""
    f0 = float(mtof(m))
    n = int(length * SR)
    t = np.arange(n) / SR
    y = np.zeros(n)
    K = int(min(fmax / f0, 30))
    for k in range(1, K + 1):
        a = np.sin(k * np.pi * pos) / k
        if abs(a) < 1e-3:
            continue
        fk = k * f0 * np.sqrt(1 + 1.2e-4 * k * k)
        y += a * np.exp(-t * d0 * (1 + 0.10 * k ** 1.4)) * np.sin(2 * np.pi * fk * t + rng.uniform(0, 0.4))
    y *= np.clip(t / 0.002, 0, 1) * np.clip((length - t) / 0.1, 0, 1)
    return y * vel


def glass(m, vel, length=2.6):
    """Music box / celesta: a pure fundamental with a few quick, slightly sharp overtones."""
    f0 = float(mtof(m))
    n = int(length * SR)
    t = np.arange(n) / SR
    w = 2 * np.pi * f0 * t
    y = (np.sin(w) * np.exp(-t / 0.8) + 0.30 * np.sin(2.0 * w) * np.exp(-t / 0.25)
         + 0.22 * np.sin(4.02 * w) * np.exp(-t / 0.12) + 0.10 * np.sin(6.31 * w) * np.exp(-t / 0.06))
    return y * np.clip(t / 0.002, 0, 1) * np.clip((length - t) / 0.2, 0, 1) * vel


def body_strings(f):
    return (0.30 + 0.9 * gauss(f, 290, 110) + 0.8 * gauss(f, 500, 150) + 0.5 * gauss(f, 950, 320)
            + 0.45 * gauss(f, 2400, 800)) / (1 + (f / 3600) ** 4)


def body_choir(f):   # between "oh" and "ah", dark
    return (0.22 + 1.0 * gauss(f, 450, 200) + 0.55 * gauss(f, 900, 220)
            + 0.18 * gauss(f, 2700, 450)) / (1 + (f / 3800) ** 4)


def ensemble(m, dur, vel, body=body_strings, nv=4, att=0.4, rel=0.6, vib=0.0035, tilt=1.0, spread=9):
    """A section of nv players: band-limited additive saws, each with its own tuning, vibrato
    and phase, shaped by a fixed body (instrument) or vowel (choir) response. Returns (l, r)."""
    f0 = float(mtof(m))
    n = int((dur + rel) * SR)
    t = np.arange(n) / SR
    K = int(max(1, min(5200 / f0, 26)))
    gains = [body(k * f0) / k ** tilt for k in range(1, K + 1)]
    out = [np.zeros(n), np.zeros(n)]
    for v in range(nv):
        det = 2 ** (rng.uniform(-spread, spread) / 1200)
        vr, vp = rng.uniform(4.7, 6.1), rng.uniform(0, 6.28)
        depth = vib * np.clip((t - 0.15) / 0.5, 0, 1) * rng.uniform(0.6, 1.2)
        ph = 2 * np.pi * np.cumsum(f0 * det * (1 + depth * np.sin(2 * np.pi * vr * t + vp))) / SR
        y = np.zeros(n)
        for k, g in enumerate(gains, 1):
            y += g * np.sin(k * ph + rng.uniform(0, 6.28))
        y *= 1 + 0.12 * np.sin(2 * np.pi * rng.uniform(0.15, 0.4) * t + rng.uniform(0, 6.28))
        w = 0.3 + 0.4 * ((v + 0.5) / nv) if nv > 1 else 0.5   # spread players left to right
        out[0] += y * (1 - w) * 2
        out[1] += y * w * 2
    env = np.clip(t / att, 0, 1) ** 1.5 * np.where(t < dur, 1.0, np.exp(-(t - dur) / (rel / 4)))
    s = vel / np.sqrt(nv) / max(gains)
    return out[0] * env * s, out[1] * env * s


def voice(phrase, vel):
    """Legato solo line: one continuous pitch curve with glides between notes and vibrato
    that blooms on the long ones. Whistle/ocarina-like 'oo' tone with a breath of air.
    phrase: [(midi or None, eighths)]. Returns (l, r)."""
    total = sum(d for _, d in phrase) * STEP
    n = int((total + 0.6) * SR)
    t = np.arange(n) / SR
    midi = np.zeros(n)
    amp = np.zeros(n)
    vibd = np.zeros(n)
    pos, last = 0.0, next(m for m, _ in phrase if m is not None)
    for m, d in phrase:
        s, e = int(pos * SR), int((pos + d * STEP) * SR)
        e = min(e, n)
        lt = np.arange(e - s) / SR
        ln = d * STEP
        if m is None:
            midi[s:e] = last
        else:
            midi[s:e] = m
            last = m
            swell = 0.72 + 0.28 * np.sin(np.pi * np.clip(lt / ln, 0, 1) ** 0.6)
            amp[s:e] = (0.5 + 0.5 * np.clip(lt / 0.05, 0, 1)) * swell
            if d >= 2:
                vibd[s:e] = np.clip((lt - 0.2) / 0.35, 0, 1)
        pos += d * STEP
    midi[int(pos * SR):] = last
    k = np.hanning(int(0.07 * SR))
    k /= k.sum()
    midi = np.convolve(np.pad(midi, len(k), mode="edge"), k, "same")[len(k):-len(k)]
    ka = np.hanning(int(0.05 * SR))
    ka /= ka.sum()
    amp = np.convolve(amp, ka, "same")
    amp *= np.clip(t / 0.06, 0, 1)
    vibd = np.convolve(vibd, ka, "same")
    out = []
    breath = fft_filter(rng.standard_normal(n), lo=1800, hi=5500)
    for cents, vr in ((0.0, 5.2), (6.0, 5.5)):
        f = mtof(midi) * 2 ** (cents / 1200) * (1 + 0.0042 * vibd * np.sin(2 * np.pi * vr * t))
        f *= 1 + 0.0008 * np.sin(2 * np.pi * 0.7 * t + cents)
        ph = 2 * np.pi * np.cumsum(f) / SR
        y = (np.sin(ph) + 0.30 * np.sin(2 * ph + 0.5) + 0.11 * np.sin(3 * ph + 1.1)
             + 0.05 * np.sin(4 * ph) + 0.025 * np.sin(5 * ph))
        y *= 1 + 0.10 * vibd * np.sin(2 * np.pi * vr * t + 1.0)
        out.append((y + 0.05 * breath) * amp * vel)
    return 0.75 * out[0] + 0.25 * out[1], 0.25 * out[0] + 0.75 * out[1]


def sub(m, dur, vel):
    f0 = float(mtof(m))
    n = int((dur + 0.5) * SR)
    t = np.arange(n) / SR
    w = 2 * np.pi * f0 * t
    y = np.sin(w) + 0.35 * np.sin(2 * w) + 0.12 * np.sin(3 * w)
    env = np.clip(t / 0.05, 0, 1) * np.where(t < dur, 1.0, np.exp(-(t - dur) / 0.12))
    return y * env * vel


def boom(vel):
    """A distant, soft low drum of the earth -- marks a new chamber."""
    n = int(2.2 * SR)
    t = np.arange(n) / SR
    f = 44 + 34 * np.exp(-t / 0.05)
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.55)
    y += 0.5 * fft_filter(rng.standard_normal(n), hi=220) * np.exp(-t / 0.12)
    return y * np.clip(t / 0.004, 0, 1) * vel


# ---------- harmony ----------
# name: (bass, seven-note arpeggio voicing low to high, four-note pad voicing)
CH = {
    "Dm":   (38, [50, 57, 64, 65, 69, 74, 76], [53, 57, 62, 64]),
    "Bb":   (34, [46, 53, 62, 64, 69, 74, 77], [53, 58, 62, 69]),
    "Gm":   (43, [43, 50, 58, 62, 69, 70, 77], [55, 58, 62, 69]),
    "Eb":   (39, [51, 58, 62, 67, 69, 74, 79], [55, 58, 63, 69]),
    "Asus": (33, [45, 52, 57, 62, 64, 69, 74], [52, 57, 62, 64]),
    "A":    (33, [45, 52, 57, 61, 64, 69, 73], [52, 57, 61, 64]),
    "F":    (41, [41, 48, 57, 60, 67, 69, 76], [53, 57, 60, 67]),
    "C":    (36, [48, 55, 62, 64, 67, 72, 76], [52, 55, 60, 62]),
    "Dm/F": (41, [53, 57, 62, 65, 69, 74, 77], [53, 57, 62, 65]),
    "Am7":  (33, [45, 52, 60, 64, 67, 72, 76], [52, 57, 60, 67]),
    "Gm7":  (43, [43, 50, 58, 62, 65, 70, 74], [53, 58, 62, 67]),
    "Fmaj7": (41, [41, 48, 57, 60, 64, 69, 76], [52, 57, 60, 65]),
    "A7b9": (33, [45, 52, 61, 64, 67, 70, 73], [52, 55, 58, 61]),
}
THEME_CH = [["Dm"], ["Bb"], ["F"], ["C"], ["Gm"], ["Dm/F"], ["Eb"], ["A"]]
PLAN = (
    [["Dm"], ["Dm"], ["Bb"], ["Bb"], ["Gm"], ["Gm"], ["Eb"], ["Asus", "A"]]              # A
    + THEME_CH                                                                         # B
    + [["Bb"], ["C"], ["Am7"], ["Dm"], ["Gm7"], ["C"], ["Fmaj7"], ["A7b9"]]            # C
    + THEME_CH                                                                         # D
    + [["Dm"], ["Bb"], ["Gm"], ["Asus", "A"]]                                          # E
)
assert len(PLAN) == BARS

# the theme: (midi, eighths). A rising call, asked three times a third higher, then let go.
THEME = [
    (69, 3), (74, 1), (76, 1), (77, 3),            # A . . D E F . .
    (76, 1), (74, 1), (70, 2), (74, 4),
    (72, 3), (77, 1), (79, 1), (81, 3),            # C . . F G A . .
    (79, 2), (76, 2), (72, 1), (74, 1), (76, 2),
    (74, 3), (79, 1), (81, 1), (82, 3),            # D . . G A Bb . .
    (81, 2), (77, 2), (74, 4),
    (75, 2), (79, 1), (82, 3), (81, 2),            # the Neapolitan: Eb G Bb, leaning on A
    (76, 3), (73, 1), (69, 3), (None, 1),
]
# the long line of the open cavern
CAVERN = [
    (77, 4), (74, 2), (77, 2), (79, 6), (76, 2), (76, 4), (72, 2), (76, 2), (77, 6), (74, 2),
    (82, 4), (79, 2), (82, 2), (84, 4), (82, 2), (79, 2), (81, 8), (82, 2), (81, 2), (79, 2), (76, 2),
]
assert sum(d for _, d in THEME) == 64 and sum(d for _, d in CAVERN) == 64

P_ODD = [0, 2, 4, 1, 3, 5, 4, 6]      # 3 + 3 + 2, climbing in waves
P_EVEN = [0, 3, 5, 2, 4, 6, 5, 3]
HARP5 = [6, 4, 5, 3, 5]                # five against the bar: never lands the same way twice
BELL5 = [6, 5, 4, 6, 3]


def section(bar):
    return "A" if bar < 8 else "B" if bar < 16 else "C" if bar < 24 else "D" if bar < 32 else "E"


def chord_at(bar, step):
    c = PLAN[bar]
    return c[min(len(c) - 1, step * len(c) // 8)]


# ---------- arrangement ----------

def main():
    names = ["keys", "voice", "strings", "choir", "harp", "bell", "bass", "sub", "spic", "boom"]
    bus = {k: Bus() for k in names}

    def notes(name, t0, phrase, fn, pan=0.0, **kw):
        pos = 0
        for m, d in phrase:
            if m is not None:
                bus[name].add(t0 + pos * STEP + hum(3), fn(m, d, **kw), pan)
            pos += d

    hstep = 0   # running counters for the five-note cycles
    for bar in range(BARS):
        sec = section(bar)
        tb = bar * BAR
        print(f"bar {bar:2d} [{sec}] {'/'.join(PLAN[bar])}", flush=True)
        pat = P_EVEN if bar % 2 else P_ODD

        # --- the walking ostinato: electric piano, every eighth, all the way through
        for s in range(8):
            c = chord_at(bar, s)
            m = CH[c][1][pat[s]] + (12 if s in (2, 5) or (s == 7 and bar % 2 == 0) else 0)   # wide leaps
            acc = 1.0 if s in (0, 3, 6) else 0.68
            lvl = {"A": 0.80, "B": 0.85, "C": 0.95, "D": 0.92, "E": 0.78}[sec]
            if sec == "E":
                lvl *= 1 - 0.05 * (bar - 32)
            bus["keys"].add(tb + s * STEP + hum(), epiano(m, acc * lvl * rng.uniform(0.9, 1.05)))

        # --- harp: glints on the off-sixteenths
        for s in range(8):
            c = chord_at(bar, s)
            v = CH[c][1]
            th = tb + (s + 0.5) * STEP + hum()
            if sec == "B" and s in (2, 5, 7) and bar >= 9:
                bus["harp"].add(th, pluck(v[[5, 6, 4][(s + bar) % 3]] + 12, 0.6 * rng.uniform(0.85, 1.05)), -0.45)
            elif sec == "C":
                bus["harp"].add(th, pluck(v[HARP5[hstep % 5]] + 12, (0.9 if hstep % 5 == 0 else 0.65) * rng.uniform(0.85, 1.05)), -0.5)
                hstep += 1
            elif sec == "D" and s % 2 == 1:
                bus["harp"].add(th, pluck(v[[6, 4, 5, 3][(s // 2 + bar) % 4]] + 12, 0.6 * rng.uniform(0.85, 1.05)), -0.45)

        # --- music box: a third line in the cavern, every dotted quarter, five-note cycle
        if sec == "C":
            for i in range(8 * (bar - 16), 8 * (bar - 15)):
                if i % 3 == 0:
                    s = i % 8
                    m = CH[chord_at(bar, s)][1][BELL5[(i // 3) % 5]] + 12
                    bus["bell"].add(tb + s * STEP + hum(), glass(m, 0.6 * rng.uniform(0.85, 1.05)), 0.5)

        # --- bass
        halves = PLAN[bar]
        for h, c in enumerate(halves):
            root = CH[c][0]
            th = tb + h * 4 * STEP
            ln = BAR / len(halves)
            if sec in ("A", "E"):
                bus["sub"].add(th, sub(root, ln, 0.5))
            elif sec == "C":
                bus["sub"].add(th, sub(root, ln, 1.0))
                bus["bass"].add(th + hum(), pluck(root, 0.9, 2.2, pos=0.3, d0=1.0, fmax=1800))
                bus["bass"].add(th + 5 * STEP + hum(), pluck(root + 7, 0.6, 1.4, pos=0.3, d0=1.2, fmax=1800))
            else:
                bus["sub"].add(th, sub(root, ln, 0.8))
        if sec in ("B", "D"):
            root = CH[halves[0]][0]
            line = [(0, root, 1.0), (3, root, 0.8), (6, root + (12 if sec == "D" and bar % 2 else 7), 0.75)]
            for s, m, v in line:
                bus["bass"].add(tb + s * STEP + hum(), pluck(m, v, 1.6, pos=0.3, d0=1.3, fmax=1800))

        # --- low spiccato strings: the stride of the second theme statement
        if sec == "D":
            root = CH[halves[0]][0] + 12
            for s in range(8):
                m = root + (7 if s in (2, 5, 7) else 0)
                v = (1.0 if s in (0, 3, 6) else 0.6) * rng.uniform(0.85, 1.05)
                bus["spic"].add(tb + s * STEP + hum(), ensemble(m, 0.09, v, nv=3, att=0.012, rel=0.5, vib=0.0))

        # --- string pad
        for h, c in enumerate(halves):
            th = tb + h * 4 * STEP
            ln = BAR / len(halves) + 0.25
            pad = CH[c][2]
            if sec == "A" or sec == "E":
                # the drone: bass octave and fifth, and from bar 4 the chord, very soft
                bus["strings"].add(th, ensemble(CH[c][0] + 12, ln, 0.32, att=0.7, rel=1.0, nv=3))
                if bar >= 4:
                    for m in pad[:3]:
                        bus["strings"].add(th, ensemble(m, ln, 0.33, att=0.8, rel=1.0, nv=3))
            else:
                lv = {"B": 0.5, "C": 0.62, "D": 0.6}[sec]
                bus["strings"].add(th, ensemble(CH[c][0] + 12, ln, lv * 0.7, att=0.5, rel=0.9, nv=3))
                for m in pad:
                    bus["strings"].add(th, ensemble(m, ln, lv * 0.8, att=0.5, rel=0.9, nv=3))

        # --- choir pad: the cavern, and the last half of the second statement
        if sec == "C" or (sec == "D" and bar >= 28):
            for h, c in enumerate(halves):
                for m in CH[c][2][1:]:
                    bus["choir"].add(tb + h * 4 * STEP, ensemble(m + 12, BAR / len(halves) + 0.3, 0.5, body=body_choir,
                                                                 nv=4, att=0.6, rel=1.1, tilt=1.35, vib=0.005, spread=12))

        if bar in (8, 16, 24):
            bus["boom"].add(tb, boom(1.0))

    # --- the melodies
    print("melodies", flush=True)
    bus["voice"].add(8 * BAR, voice(THEME, 0.85))                       # B: alone
    bus["voice"].add(24 * BAR, voice(THEME, 0.92))                       # D: with company
    notes("strings", 24 * BAR, THEME, lambda m, d: ensemble(m - 12, d * STEP * 0.97, 0.6, att=0.12, rel=0.5, nv=4))
    notes("bell", 24 * BAR, THEME, lambda m, d: glass(m + 12, 0.55), pan=0.3)
    # C: high strings and choir carry the long line
    notes("strings", 16 * BAR, CAVERN, lambda m, d: ensemble(m, d * STEP * 0.98, 0.5, att=0.3, rel=0.8, nv=4))
    notes("choir", 16 * BAR, CAVERN, lambda m, d: ensemble(m - 12, d * STEP * 0.98, 0.8, body=body_choir, nv=4,
                                                           att=0.25, rel=0.9, tilt=1.35, vib=0.005, spread=12))
    # A: the music box half-remembers the theme; E: it lets it go
    box = lambda m, d: glass(m, 0.6)
    notes("bell", 2 * BAR, [(81, 3), (86, 1), (88, 1), (89, 3)], box, pan=0.25)
    notes("bell", 6 * BAR, [(87, 2), (91, 1), (94, 3), (93, 2)], box, pan=-0.25)
    notes("bell", 33 * BAR, [(89, 3), (88, 1), (86, 4)], box, pan=0.25)
    notes("bell", 35 * BAR, [(86, 4), (85, 4)], box, pan=-0.25)

    # ---------- mix ----------
    print("mixing", flush=True)

    def rms_db(x, a, b):
        seg = x[int(a * BAR * SR):int(b * BAR * SR)]
        return 10 * np.log10(np.mean(seg ** 2) + 1e-20)

    # name: (reference bars, target rms dB there, reverb send, delay send)
    targets = {
        "keys":    ((0, 8),   -22.0, 0.30, 0.30),
        "voice":   ((8, 16),  -22.0, 0.45, 0.20),
        "strings": ((8, 16),  -27.0, 0.50, 0.0),
        "choir":   ((16, 24), -25.0, 0.60, 0.0),
        "harp":    ((16, 24), -25.5, 0.35, 0.30),
        "bell":    ((16, 24), -28.0, 0.50, 0.40),
        "bass":    ((8, 16),  -28.0, 0.10, 0.0),
        "sub":     ((8, 16),  -34.0, 0.0,  0.0),
        "spic":    ((24, 32), -28.0, 0.35, 0.0),
        "boom":    ((8, 9),   -29.0, 0.40, 0.0),
    }
    mix = [np.zeros(TOTAL), np.zeros(TOTAL)]
    send = [np.zeros(TOTAL), np.zeros(TOTAL)]
    dsend = [np.zeros(TOTAL), np.zeros(TOTAL)]
    for name, ((a, b), tgt, rv, dl) in targets.items():
        mono = 0.5 * (bus[name].l + bus[name].r)
        g = 10 ** ((tgt - rms_db(mono, a, b)) / 20)
        for c, ch in enumerate((bus[name].l, bus[name].r)):
            ch = ch * g
            if name == "strings":
                ch = fft_filter(ch, lo=130, hi=5500)
            if name == "keys":
                ch = fft_filter(ch, lo=150)
            mix[c] += ch
            send[c] += rv * ch
            dsend[c] += dl * ch
    for c, d in enumerate((int(1.5 * STEP * SR), int(2.5 * STEP * SR))):
        dl = 0.45 * fb_delay(fft_filter(dsend[c], lo=350, hi=3200), d, 0.35)
        mix[c] += dl
        send[c] += 0.3 * dl
    print("reverb", flush=True)
    for c in (0, 1):
        mix[c] += 0.55 * reverb(send[c], 3.4, c + 1)

    out = np.stack([m[:N].copy() for m in mix])
    for c in (0, 1):
        out[c, :TAIL] += mix[c][N:]      # the tail wraps into the start: a seamless loop

    # cave air: FFT-filtered noise is periodic over the loop, and so are its swells
    tt = np.arange(N) / N
    for c in (0, 1):
        air = fft_filter(rng.standard_normal(N), lo=250, hi=1800)
        air *= 0.6 + 0.4 * np.sin(2 * np.pi * (3 * tt + 0.25 * c)) * np.sin(2 * np.pi * (7 * tt + 0.1))
        out[c] += air * 10 ** (-52 / 20) / np.sqrt(np.mean(air ** 2))

    # width: keep the low end in the middle, the rest open but not hollow
    mid, side = 0.5 * (out[0] + out[1]), 0.5 * (out[0] - out[1])
    side = 0.6 * fft_filter(side, lo=180)
    out = np.stack([fft_filter(c, lo=28, hi=12000) for c in (mid + side, mid - side)])
    pk = np.max(np.abs(out))
    out = np.tanh(1.25 * out / pk) / np.tanh(1.25)      # soft knee on the few tallest peaks
    out *= 10 ** (-1.05 / 20) / np.max(np.abs(out))
    assert np.all(np.isfinite(out))
    rms = 20 * np.log10(np.sqrt(np.mean(out ** 2)))
    print(f"length {N / SR:.2f}s, rms {rms:.1f} dBFS, peak {20 * np.log10(np.max(np.abs(out))):.2f} dBFS")

    pcm = np.round(out.T * 32767).astype("<i2")
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        wav = arg("--wav") or os.path.join(tmp, "out.wav")
        with wave.open(wav, "wb") as w:
            w.setnchannels(2)
            w.setsampwidth(2)
            w.setframerate(SR)
            w.writeframes(pcm.tobytes())
        subprocess.run(["/opt/homebrew/bin/ffmpeg" if os.path.exists("/opt/homebrew/bin/ffmpeg") else "ffmpeg",
                        "-y", "-loglevel", "error", "-i", wav, "-c:a", "libvorbis", "-q:a", "6", OUT], check=True)
    print("wrote", os.path.relpath(OUT, ROOT))


if __name__ == "__main__":
    main()
