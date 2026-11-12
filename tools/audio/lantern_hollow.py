#!/usr/bin/env python3
"""Lantern Hollow: an original looping track, mysterious and fablelike, light on its feet.

Small chamber ensemble: celesta ostinato, harp, flute and clarinet leads, pizzicato bass,
strings and a wordless choir, frame drum, shaker and triangle. E minor with lydian colour,
6/8 at a dotted quarter of 72 (quick eighths). 48 bars, loops seamlessly.
Renders content/audio/music/lantern-hollow.ogg. Needs numpy and ffmpeg.

    python3 tools/audio/lantern_hollow.py [--seed N]
"""
import os
import subprocess
import sys
import tempfile
import wave

import numpy as np

SR = 44100
EIGHTH = 60 / 216
BAR = 6 * EIGHTH
BARS = 48
N = int(round(BARS * BAR * SR))
TAIL = 6 * SR

seed = int(sys.argv[sys.argv.index("--seed") + 1]) if "--seed" in sys.argv else 1987
rng = np.random.default_rng(seed)

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "content", "audio", "music", "lantern-hollow.ogg")


# ---------- dsp helpers ----------

def mtof(m):
    return 440.0 * 2 ** ((np.asarray(m, float) - 69) / 12)


def lp1(x, fc):
    a = 1 - np.exp(-2 * np.pi * np.broadcast_to(np.asarray(fc, float), x.shape) / SR)
    out = [0.0] * len(x)
    s = 0.0
    for i, (xi, ai) in enumerate(zip(x.tolist(), a.tolist())):
        s += ai * (xi - s)
        out[i] = s
    return np.array(out)


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


def reverb(x, secs, seed_off):
    n = int(secs * SR)
    t = np.arange(n) / SR
    r = np.random.default_rng(seed + seed_off)
    ir = r.standard_normal(n) * np.exp(-6.9 * t / secs)
    ir = fft_filter(ir, lo=180, hi=5500)
    ir *= np.clip((t - 0.025) / 0.03, 0, 1)  # small predelay: a stone hall
    ir /= np.sqrt(np.sum(ir ** 2))
    size = 1 << int(np.ceil(np.log2(len(x) + n)))
    return np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(ir, size), size)[:len(x)]


def env_ar(t, attack, dur, release):
    return np.clip(t / attack, 0, 1) * np.where(t < dur, 1.0, np.exp(-(t - dur) / release))


class Bus:
    def __init__(self):
        self.l = np.zeros(N + TAIL)
        self.r = np.zeros(N + TAIL)

    def add(self, t, y, pan=0.0):
        s = max(0, int(round(t * SR)))
        e = min(s + len(y), N + TAIL)
        self.l[s:e] += y[:e - s] * (1 - pan)
        self.r[s:e] += y[:e - s] * (1 + pan)


def at(bar, eighth):
    return bar * BAR + eighth * EIGHTH


def hum(ms=5):
    return rng.normal(0, ms / 1000)


# ---------- harmony ----------
# (bass midi, chord tones) per bar of the 8-bar cycle
PROG_MAIN = [
    (40, [64, 67, 71, 74, 78]),   # Em9
    (36, [64, 67, 71, 78]),       # Cmaj7#11
    (45, [64, 67, 69, 71, 72]),   # Am9
    (35, [63, 66, 69, 71]),       # B7
    (40, [64, 67, 71, 74, 78]),   # Em9
    (42, [62, 66, 69, 73]),       # D/F#  (D6 colour, C# from dorian)
    (36, [64, 66, 67, 71]),       # Cmaj7#11
    (35, [63, 66, 69, 71]),       # B7
]
# the descent: heavier chords, half-diminished and a flat-nine dominant
PROG_LIFT = [
    (36, [64, 66, 67, 71]),       # Cmaj7#11
    (45, [64, 67, 71, 72]),       # Am9
    (42, [64, 66, 69, 72]),       # F#m7b5
    (40, [64, 67, 71, 78]),       # Em9
    (36, [64, 66, 67, 71]),       # Cmaj7#11
    (45, [64, 67, 71, 72]),       # Am9
    (42, [64, 66, 69, 72]),       # F#m7b5
    (35, [63, 66, 69, 72]),       # B7b9
]

# original flute melody: (eighth, midi, length in eighths) per bar
MELODY = [
    [(0, 71, 2), (2, 76, 1), (3, 78, 2), (5, 79, 1)],
    [(0, 78, 3), (3, 76, 1), (4, 71, 2)],
    [(0, 81, 2), (2, 79, 1), (3, 76, 2), (5, 74, 1)],
    [(0, 75, 3), (3, 78, 3)],
    [(0, 83, 2), (2, 81, 1), (3, 79, 1), (4, 78, 1), (5, 79, 1)],
    [(0, 81, 3), (3, 78, 1), (4, 74, 2)],
    [(0, 76, 2), (2, 78, 1), (3, 79, 1), (4, 83, 2)],
    [(0, 81, 2), (2, 79, 1), (3, 78, 3)],
]
LIFT_MELODY = [
    [(0, 79, 3), (3, 78, 1), (4, 79, 1), (5, 83, 1)],
    [(0, 81, 4), (4, 76, 2)],
    [(0, 78, 2), (2, 72, 1), (3, 76, 3)],
    [(0, 71, 6)],
    [(0, 79, 2), (2, 83, 1), (3, 86, 3)],
    [(0, 84, 2), (2, 81, 1), (3, 76, 3)],
    [(0, 78, 3), (3, 72, 3)],
    [(0, 76, 2), (2, 75, 1), (3, 71, 3)],
]


# ---------- instruments ----------

def celesta(m, vel):
    """Struck bar: bright inharmonic attack that melts into a sine."""
    t = np.arange(int(2.2 * SR)) / SR
    f = mtof(m)
    y = (np.sin(2 * np.pi * f * t) * np.exp(-t * 2.0)
         + 0.35 * np.sin(2 * np.pi * f * 4.0 * t) * np.exp(-t * 9)
         + 0.12 * np.sin(2 * np.pi * f * 9.2 * t) * np.exp(-t * 22))
    return y * np.clip(t / 0.002, 0, 1) * vel * 0.07


def harp(m, vel, length=1.8):
    t = np.arange(int(length * SR)) / SR
    f = mtof(m)
    y = np.zeros_like(t)
    for k in range(1, 9):
        if f * k > 9000:
            break
        y += np.sin(np.pi * k * 0.18) / k ** 1.2 * np.sin(2 * np.pi * f * k * t + rng.random()) * np.exp(-t * (0.9 + 0.7 * k))
    return y * np.clip(t / 0.0025, 0, 1) * vel * 0.06


def pizz(m, vel):
    t = np.arange(int(0.7 * SR)) / SR
    f = mtof(m)
    y = sum(np.sin(2 * np.pi * f * k * t) / k ** 1.5 * np.exp(-t * (5 + 4 * k)) for k in range(1, 7))
    return np.tanh(1.5 * y) * np.clip(t / 0.003, 0, 1) * vel * 0.16


def wind(notes, t0, kind, bus, pan):
    """Legato flute or clarinet line: glides between notes, breath noise, late vibrato."""
    if not notes:
        return
    start = notes[0][0]
    end = notes[-1][0] + notes[-1][2]
    n = int((end - start + 0.5) * SR)
    t = np.arange(n) / SR
    pitch = np.full(n, np.nan)
    pitch[0] = notes[0][1]
    amp = np.zeros(n)
    prev = None
    for s, m, d in notes:
        i0 = int((s - start) * SR)
        i1 = min(int((s - start + d) * SR), n)
        tt = np.arange(i1 - i0) / SR
        glide = 0 if prev is None else (prev - m) * np.exp(-tt / 0.03)
        vib = 0.12 * np.sin(2 * np.pi * 5.2 * tt) * np.clip((tt - 0.2) / 0.25, 0, 1)
        pitch[i0:i1] = m + glide + vib
        shape = np.clip(tt / (0.035 if prev is None else 0.015), 0, 1) * (0.85 + 0.15 * np.exp(-tt / 0.08))
        shape *= np.clip((d - tt) / 0.04, 0.35, 1)  # dip between notes, never a full stop
        amp[i0:i1] = shape
        prev = m
    tail = int((end - start) * SR)
    amp[tail:] = amp[tail - 1] * np.exp(-np.arange(n - tail) / SR / 0.12)
    # hold each note's pitch through the short gap before the next one
    held = np.where(np.isnan(pitch), 0, np.arange(n))
    pitch = pitch[np.maximum.accumulate(held)]
    amp = lp1(amp, 40.0)
    ph = 2 * np.pi * np.cumsum(mtof(pitch)) / SR
    if kind == "flute":
        y = np.sin(ph) + 0.18 * np.sin(2 * ph) + 0.06 * np.sin(3 * ph)
        noise = rng.standard_normal(n)
        y += 0.12 * (lp1(noise, 4000) - lp1(noise, 1500)) * (0.5 + amp)
        g = 0.10
    else:
        y = np.sin(ph) + 0.45 * np.sin(3 * ph) + 0.22 * np.sin(5 * ph) + 0.1 * np.sin(7 * ph) + 0.05 * np.sin(2 * ph)
        g = 0.075
    bus.add(t0 + start, y * amp * g, pan)


def strings(notes, t0, dur, vel, bus, cut=1100):
    n = int((dur + 1.6) * SR)
    t = np.arange(n) / SR
    out = [np.zeros(n), np.zeros(n)]
    for m in notes:
        for side, acc in enumerate(out):
            for _ in range(2):
                vib = 1 + 0.0025 * np.sin(2 * np.pi * rng.uniform(4.5, 5.8) * t + rng.random() * 6)
                f = mtof(m) * 2 ** (rng.uniform(-8, 8) / 1200) * vib
                ph = np.cumsum(f) / SR + rng.random()
                acc += 2 * (ph % 1) - 1
    env = env_ar(t, 0.7, dur, 0.6) * vel * 0.03 / len(notes) ** 0.5
    for side in (0, 1):
        y = lp1(lp1(out[side], cut), cut) * env
        s =max(0, int(round(t0 * SR)))
        e = min(s + n, N + TAIL)
        (bus.l if side == 0 else bus.r)[s:e] += y[:e - s]


FORMANTS = [(480, 1.0, 100), (820, 0.55, 120), (2500, 0.08, 220)]  # a dark "oh"


def choir(notes, t0, dur, vel, bus):
    n = int((dur + 2.0) * SR)
    t = np.arange(n) / SR
    env = env_ar(t, 1.1, dur, 0.9) * vel * 0.02
    for m in notes:
        for v in range(3):
            f0 = mtof(m) * 2 ** (rng.uniform(-10, 10) / 1200)
            vib = 1 + 0.004 * np.sin(2 * np.pi * rng.uniform(4.8, 5.6) * t + rng.random() * 6)
            ph = 2 * np.pi * np.cumsum(f0 * vib) / SR
            y = np.zeros(n)
            for k in range(1, int(3800 / f0) + 1):
                w = sum(a * np.exp(-((f0 * k - F) / bw) ** 2) for F, a, bw in FORMANTS) + 0.02
                y += w * np.sin(k * ph)
            bus.add(t0, y * env, pan=(v - 1) * 0.5)


def frame_drum(vel):
    t = np.arange(int(0.6 * SR)) / SR
    ph = 2 * np.pi * np.cumsum(52 + 40 * np.exp(-t / 0.04)) / SR
    skin = lp1(rng.standard_normal(len(t)), 900) * np.exp(-t / 0.05)
    return (np.sin(ph) * np.exp(-t / 0.22) + 0.6 * skin) * vel * 0.32


def shaker(vel):
    t = np.arange(int(0.12 * SR)) / SR
    noise = rng.standard_normal(len(t))
    return (noise - lp1(noise, 6000)) * np.clip(t / 0.012, 0, 1) * np.exp(-t / 0.035) * vel * 0.035


def boom():
    """Deep low hit, like a big drum far away in the hall."""
    t = np.arange(int(2.5 * SR)) / SR
    ph = 2 * np.pi * np.cumsum(38 + 30 * np.exp(-t / 0.08)) / SR
    body = lp1(rng.standard_normal(len(t)), 300) * np.exp(-t / 0.12)
    return np.tanh(1.4 * (np.sin(ph) * np.exp(-t / 0.9) + 0.8 * body)) * 0.4


def triangle():
    t = np.arange(int(2.5 * SR)) / SR
    y = sum(a * np.sin(2 * np.pi * 1850 * r * t) * np.exp(-t * d) for r, a, d in [(1, 1, 1.4), (2.76, 0.5, 2.2), (5.4, 0.3, 3.5)])
    return y * np.clip(t / 0.001, 0, 1) * 0.025


def swell(notes):
    """A celesta chord through a long hall, played backwards: rises into the next downbeat."""
    y = sum(celesta(m, 0.8) for m in notes)
    t = np.arange(int(2.0 * SR)) / SR
    ir = rng.standard_normal(len(t)) * np.exp(-t / 0.5)
    size = 1 << int(np.ceil(np.log2(len(y) + len(ir))))
    wet = np.fft.irfft(np.fft.rfft(y, size) * np.fft.rfft(ir, size), size)[:len(y) + len(ir)]
    wet = fft_filter(wet, lo=200, hi=5000)
    return wet[::-1] / np.max(np.abs(wet)) * 0.12


def drone(m, t0, dur, bus):
    """Low bowed bass, breathing slowly, for the hollow middle."""
    n = int((dur + 1.5) * SR)
    t = np.arange(n) / SR
    ph = np.cumsum(mtof(m) * (1 + 0.002 * np.sin(2 * np.pi * 0.3 * t))) / SR
    y = lp1(2 * (ph % 1) - 1, 500)
    y *= env_ar(t, 1.5, dur, 1.0) * (0.75 + 0.25 * np.sin(2 * np.pi * 0.25 * t)) * 0.09
    bus.add(t0, y)


# ---------- arrangement ----------

def section(b):
    return "ABCDEF"[b // 8]


def main():
    bus = {k: Bus() for k in ["celesta", "harp", "lead", "bass", "pad", "perc"]}
    tri = triangle()

    for sec_start in range(0, BARS, 8):
        sec = section(sec_start)
        prog = PROG_LIFT if sec == "D" else PROG_MAIN
        t_sec = sec_start * BAR
        print(f"section {sec} (bars {sec_start + 1}-{sec_start + 8})", flush=True)

        # leads: whole 8-bar phrases, rendered legato
        def phrase(mel, shift, cut_to=None):
            notes = []
            for i, bar in enumerate(mel[:cut_to]):
                for e, m, d in bar:
                    notes.append((at(i, e) + hum(4), m + shift, d * EIGHTH * 0.97))
            return notes
        sw = swell([m - 12 for m in prog[0][1][:3]] + [prog[0][1][-1]])
        bus["pad"].add((t_sec if sec != "A" else N / SR) - len(sw) / SR, sw)
        if sec == "B":
            wind(phrase(MELODY, 0), t_sec, "flute", bus["lead"], 0.15)
            wind(phrase(MELODY, -12), t_sec + 0.008, "clarinet", bus["lead"], -0.2)
        if sec == "C":
            wind(phrase(MELODY, -12), t_sec, "clarinet", bus["lead"], -0.2)
            counter = [(at(i, 0) + hum(4), PROG_MAIN[i][1][-1] + 12, 5.6 * EIGHTH) for i in range(8)]
            wind(counter, t_sec, "flute", bus["lead"], 0.3)
        if sec == "D":
            wind(phrase(LIFT_MELODY, 0), t_sec, "flute", bus["lead"], 0.1)
            wind(phrase(LIFT_MELODY, -12), t_sec + 0.01, "clarinet", bus["lead"], -0.25)
        if sec == "E":
            wind(phrase(MELODY, -12, 4), t_sec + 4 * BAR, "clarinet", bus["lead"], -0.1)
        if sec == "F":
            wind(phrase(MELODY, 0, 4), t_sec, "flute", bus["lead"], 0.15)

        for i in range(8):
            b = sec_start + i
            root, tones = prog[i]
            t_bar = b * BAR
            hi = sorted(tones)
            box = hi

            # celesta ostinato: a turning figure through the chord, quick and curious;
            # every fourth bar it ends on a flat second, a door left ajar
            fig = [0, 2, 1, 3, 2, len(box) - 1]
            if sec != "E" or i % 2 == 0:
                for e in range(6):
                    m = box[fig[e] % len(box)]
                    if e == 5 and i % 4 == 3:
                        m = root % 12 + 61 + (12 if root % 12 + 61 < 64 else 0)
                    v = (0.9 if e in (0, 3) else 0.6) * rng.uniform(0.85, 1.05)
                    bus["celesta"].add(at(b, e) + hum(3), celesta(m, v), pan=-0.25 + 0.1 * (e % 3))
                if sec in ("C", "D", "F"):  # little 16th sparkles on the last beat
                    for e2 in (4.5, 5.5):
                        bus["celesta"].add(at(b, e2) + hum(3), celesta(box[-1] + 12 if e2 == 5.5 else box[-1], 0.3), pan=0.3)
            elif sec == "E":
                bus["celesta"].add(at(b, 0) + hum(), celesta(box[-1], 0.6), pan=0.2)

            # harp: low rolling arpeggio, 16ths in the busier sections
            if sec in ("A", "B", "C", "D", "F") or i >= 6:
                notes = [root + 12, root + 19, hi[0], hi[1], hi[2], root + 24]
                step = 0.5 if sec in ("C", "D") else 1.0
                k = 0
                e = 0.0
                while e < 6:
                    m = notes[k % len(notes)]
                    bus["harp"].add(at(b, e) + hum(4), harp(m, 0.9 if e in (0, 3) else 0.65), pan=0.25)
                    k += 1
                    e += step

            # bass: pizzicato on the two big beats, a pickup into the next bar
            if sec in ("B", "C", "D", "F"):
                nroot = prog[(i + 1) % 8][0]
                bus["bass"].add(at(b, 0) + hum(3), pizz(root, 1.0))
                bus["bass"].add(at(b, 3) + hum(3), pizz(root + 7, 0.7))
                if i % 2 == 1:
                    bus["bass"].add(at(b, 5) + hum(3), pizz(nroot + 2 if nroot + 2 != root else nroot - 1, 0.55))

            # sustained bed
            if sec in ("A", "B", "C", "D", "F"):
                strings(hi[:4], t_bar, BAR, 0.8 if sec == "A" else 1.0, bus["pad"])
                strings([root + 12, root + 19], t_bar, BAR, 1.3, bus["pad"], cut=650)  # cellos
            if sec != "A" and i % 2 == 0:
                choir([root + 12] + [m - 12 for m in hi[1:4]], t_bar, BAR * 2, 1.0 if sec != "E" else 1.3, bus["pad"])
            if sec in ("A", "E") and i % 4 == 0:
                drone(28, t_bar, BAR * 4, bus["pad"])
            if i % 4 == 0 and (sec in ("B", "C", "D", "F") or (sec == "E" and i == 0)):
                bus["perc"].add(at(b, 0), boom())

            # percussion: frame drum heartbeat in 6/8, shaker eighths
            if sec in ("B", "C", "D", "F") or (sec == "A" and i >= 4):
                bus["perc"].add(at(b, 0) + hum(3), frame_drum(1.0))
                bus["perc"].add(at(b, 3) + hum(3), frame_drum(0.6))
                if rng.random() < 0.5:
                    bus["perc"].add(at(b, 5) + hum(3), frame_drum(0.3))
            if sec in ("B", "C", "D", "F"):
                for e in range(6):
                    bus["perc"].add(at(b, e) + hum(4), shaker(1.0 if e in (0, 3) else 0.55), pan=0.4)
                    if sec in ("C", "D"):
                        bus["perc"].add(at(b, e + 0.5) + hum(4), shaker(0.3), pan=0.4)
            if (sec == "D" and i % 2 == 0) or (sec == "F" and i == 0):
                bus["perc"].add(at(b, 0), tri, pan=-0.4)
            if b == BARS - 1:  # roll into the top of the loop
                for e in (3, 4, 4.5, 5, 5.5):
                    bus["perc"].add(at(b, e) + hum(3), frame_drum(0.35 + 0.1 * e - 0.2))

    print("mixing", flush=True)
    total = N + TAIL
    mix = [np.zeros(total), np.zeros(total)]
    send = [np.zeros(total), np.zeros(total)]
    dsend = [np.zeros(total), np.zeros(total)]
    #               gain reverb delay
    plan = {"celesta": (1.0, 0.45, 0.3),
            "harp": (0.9, 0.35, 0.0),
            "lead": (1.0, 0.45, 0.15),
            "bass": (1.0, 0.1, 0.0),
            "pad": (1.0, 0.55, 0.0),
            "perc": (0.9, 0.2, 0.0)}
    for name, (g, rv, dl) in plan.items():
        for c, ch in enumerate((bus[name].l, bus[name].r)):
            mix[c] += g * ch
            send[c] += rv * ch
            dsend[c] += dl * ch
    for c, d in enumerate((int(3 * EIGHTH * SR), int(2 * EIGHTH * SR))):
        mix[c] += 0.35 * fb_delay(fft_filter(dsend[c], lo=400, hi=4000), d, 0.35)
    print("reverb", flush=True)
    for c in (0, 1):
        mix[c] += 0.6 * reverb(send[c], 4.5, c + 1)

    out = np.stack([m[:N].copy() for m in mix])
    for c in (0, 1):
        out[c, :TAIL] += mix[c][N:]

    out = np.tanh(1.1 * out / np.max(np.abs(out)) * 0.9) / np.tanh(1.1 * 0.9)
    out = np.stack([fft_filter(c, lo=28, hi=9000) for c in out])
    out *= 0.89 / np.max(np.abs(out))
    rms = 20 * np.log10(np.sqrt(np.mean(out ** 2)))
    print(f"length {N / SR:.1f}s, rms {rms:.1f} dBFS, peak -1.0 dBFS")

    pcm = (out.T * 32767).astype("<i2")
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        wav = os.path.join(tmp, "out.wav")
        with wave.open(wav, "wb") as w:
            w.setnchannels(2)
            w.setsampwidth(2)
            w.setframerate(SR)
            w.writeframes(pcm.tobytes())
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-c:a", "libvorbis", "-q:a", "6", OUT], check=True)
    print("wrote", os.path.relpath(OUT, ROOT))


if __name__ == "__main__":
    main()
