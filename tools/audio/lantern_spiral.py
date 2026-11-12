#!/usr/bin/env python3
"""Lantern Spiral: an original looping track of interlocking arpeggios.

Soft sustained synth keys leap across octaves in odd-length patterns (15, 13 and 11 steps)
that drift against a 16-step bass, so the figure never lines up the same way twice.
Centred on D with chromatic neighbours (Eb, Ab, Bb). No drums. Eighth note = 0.279 s.
288 steps (~80 s), loops seamlessly.
Renders content/audio/music/lantern-spiral.ogg. Needs numpy and ffmpeg.

    python3 tools/audio/lantern_spiral.py [--seed N]
"""
import os
import subprocess
import sys
import tempfile
import wave

import numpy as np

SR = 44100
STEP = 0.279
STEPS = 288
N = int(round(STEPS * STEP * SR))
TAIL = 6 * SR

seed = int(sys.argv[sys.argv.index("--seed") + 1]) if "--seed" in sys.argv else 2014
rng = np.random.default_rng(seed)

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "content", "audio", "music", "lantern-spiral.ogg")


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
    ir = fft_filter(ir, lo=200, hi=6000)
    ir *= np.clip((t - 0.015) / 0.02, 0, 1)
    ir /= np.sqrt(np.sum(ir ** 2))
    size = 1 << int(np.ceil(np.log2(len(x) + n)))
    return np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(ir, size), size)[:len(x)]


class Bus:
    def __init__(self):
        self.l = np.zeros(N + TAIL)
        self.r = np.zeros(N + TAIL)

    def add(self, t, y, pan=0.0):
        s = max(0, int(round(t * SR)))
        e = min(s + len(y), N + TAIL)
        self.l[s:e] += y[:e - s] * (1 - pan)
        self.r[s:e] += y[:e - s] * (1 + pan)


def hum(ms=4):
    return rng.normal(0, ms / 1000)


# ---------- harmony ----------
# chord pools: (bass midi, pitch classes the arps may use)
CHORDS = {
    "Dm9":     (38, [2, 5, 9, 0, 4]),
    "Bbmaj9":  (34, [10, 2, 5, 9, 0]),
    "Gm9":     (43, [7, 10, 2, 5, 9]),
    "Abmaj7":  (44, [8, 0, 3, 7, 2]),     # with a D on top: the tritone, the mystery
    "Ebmaj9":  (39, [3, 7, 10, 2, 5]),
    "A7b9":    (45, [9, 1, 4, 7, 10]),
    "Fmaj9":   (41, [5, 9, 0, 4, 7]),
    "Dm(maj9)": (38, [2, 5, 9, 1, 4]),
}
# one chord per 16 steps; sections of 64 steps (A, B, D) and 96 (C)
PLAN = (
    ["Dm9", "Bbmaj9", "Gm9", "Abmaj7"] +                          # A: one line alone
    ["Dm9", "Ebmaj9", "Gm9", "A7b9"] +                            # B: second line answers
    ["Fmaj9", "Ebmaj9", "Fmaj9", "Abmaj7", "Bbmaj9", "A7b9"] +    # C: the web
    ["Dm9", "Bbmaj9", "Gm9", "Abmaj7"]                            # D: thinning; Ab falls a tritone into the top
)
assert len(PLAN) * 16 == STEPS

# arp shapes: (index into the chord pool, octave above 4) -- wide leaps, odd lengths
SHAPE_A = [(0, 0), (0, 2), (2, 0), (2, 1), (1, 0), (4, 1), (3, 2), (0, 1),
           (4, 2), (1, 0), (3, 1), (2, 2), (1, 1), (4, 0), (3, 1)]           # 15
SHAPE_B = [(2, 1), (4, 1), (0, 2), (3, 1), (1, 2), (2, 1), (4, 2),
           (0, 1), (3, 2), (1, 1), (4, 1), (2, 2), (0, 2)]                    # 13
SHAPE_C = [(4, 0), (1, 1), (3, 0), (0, 1), (2, 1), (4, 1), (1, 0),
           (3, 1), (0, 0), (2, 0), (1, 1)]                                    # 11


def spread(m):
    """Low notes lean left, high notes lean right, so a leaping line moves across the stereo field."""
    return float(np.clip((m - 74) / 30, -0.35, 0.35))


def pitch(chord, idx, octv):
    pcs = CHORDS[chord][1]
    pc = pcs[idx % len(pcs)]
    return 55 + (pc - 7) % 12 + 12 * octv  # G3 up to F#6


# ---------- instruments ----------

def keys(m, vel, bright, length=2.2):
    """Soft sustained synth key: mostly fundamental, a little 2nd and 3rd, slight pitch drift,
    sometimes a quick flutter. bright > 0 adds harmonics and a chorus voice for the dense part."""
    n = int(length * SR)
    t = np.arange(n) / SR
    drift = rng.uniform(-9, 9) * np.exp(-t / 0.25) + rng.uniform(-5, 5) * t / length
    f = mtof(m) * 2 ** (drift / 1200)
    ph = 2 * np.pi * np.cumsum(f) / SR
    y = (np.sin(ph) + (0.45 + 0.2 * bright) * np.sin(2 * ph) * np.exp(-t * 2.5)
         + (0.22 + 0.2 * bright) * np.sin(3 * ph) * np.exp(-t * 4))
    if bright > 0:
        for k in range(4, 9):
            y += bright * 0.35 / k * np.sin(k * ph) * np.exp(-t * (2 + k))
        ph2 = 2 * np.pi * np.cumsum(f * 2 ** (7 / 1200)) / SR
        y += 0.5 * bright * (np.sin(ph2) + 0.3 * np.sin(2 * ph2))
        y = np.tanh(0.9 * y)
    amp = np.clip(t / 0.004, 0, 1) * np.exp(-t * 1.3) * np.clip((length - t) / 0.3, 0, 1)
    if rng.random() < 0.08:
        amp *= 1 - 0.6 * (0.5 + 0.5 * np.sin(2 * np.pi * 13 * t))
    y *= amp * vel * 0.06 * (1 - 0.01 * (m - 62))
    if m < 62:  # key thump on the low notes
        y[:600] += lp1(rng.standard_normal(600), 400) * np.exp(-np.arange(600) / 150) * 0.03 * vel
    return y


def bass(m, t0, dur, vel, bus):
    n = int((dur + 0.6) * SR)
    t = np.arange(n) / SR
    ph = 2 * np.pi * np.cumsum(mtof(m) * (1 + 0.0015 * np.sin(2 * np.pi * 0.3 * t))) / SR
    y = np.sin(ph) + 0.25 * np.sin(2 * ph) + 0.08 * np.sin(3 * ph)
    env = np.clip(t / 0.03, 0, 1) * np.where(t < dur, 1 - 0.35 * (1 - np.exp(-t / 1.2)), 0.65 * np.exp(-(t - dur) / 0.25))
    bus.add(t0, y * env * vel * 0.04)


def pad(pcs, t0, dur, vel, bus):
    n = int((dur + 1.5) * SR)
    t = np.arange(n) / SR
    env = np.clip(t / 1.2, 0, 1) * np.where(t < dur, 1.0, np.exp(-(t - dur) / 0.6)) * vel * 0.016
    for side, pan in ((0, -0.6), (1, 0.6)):
        acc = np.zeros(n)
        for pc in pcs[:4]:
            f = mtof(57 + (pc - 9) % 12) * 2 ** (rng.uniform(-6, 6) / 1200)
            ph = np.cumsum(f * (1 + 0.002 * np.sin(2 * np.pi * rng.uniform(0.2, 0.5) * t))) / SR + rng.random()
            acc += 2 * (ph % 1) - 1
        bus.add(t0, lp1(lp1(acc, 900), 900) * env, pan)


# ---------- arrangement ----------

def section(step):
    return "A" if step < 64 else "B" if step < 128 else "C" if step < 224 else "D"


def main():
    bus = {k: Bus() for k in ["keys", "bass", "pad"]}

    for s in range(STEPS):
        sec = section(s)
        chord = PLAN[s // 16]
        t = s * STEP
        if s % 32 == 0:
            print(f"step {s:3d}/{STEPS} [{sec}] {chord}", flush=True)

        # line 1: always present, centre-left; accented at the start of its own cycle
        i = s % len(SHAPE_A)
        idx, octv = SHAPE_A[i]
        if sec == "D" and s >= 272:
            octv = min(octv, 1)  # settle lower before the loop returns to the solo line
        v = (1.0 if i == 0 else 0.8 if octv == 0 else 0.62) * rng.uniform(0.85, 1.05)
        bright = 0.45 if sec == "C" else 0.0
        m = pitch(chord, idx, octv)
        bus["keys"].add(t + hum(), keys(m, v, bright), pan=spread(m) - (0.15 if sec != "A" else 0.0))

        # line 2: enters in B, on the off-step, lighter, to the right
        if sec in ("B", "C") or (sec == "D" and s < 256):
            j = s % len(SHAPE_B)
            idx, octv = SHAPE_B[j]
            if not (sec == "B" and s < 96 and s % 2):  # it enters sparse, every other step
                bus["keys"].add(t + STEP * 0.5 + hum(), keys(pitch(chord, idx, octv), 0.55 * rng.uniform(0.85, 1.05), bright * 0.8), pan=0.45)

        # line 3: only in the web, low and dark, on the main steps
        if sec == "C":
            k = s % len(SHAPE_C)
            idx, octv = SHAPE_C[k]
            bus["keys"].add(t + hum(), keys(pitch(chord, idx, octv), 0.5 * rng.uniform(0.85, 1.05), 0.3, 2.6), pan=-0.5)
            if s % 4 == 2:  # a high glint every half beat-pair
                bus["keys"].add(t + hum(), keys(pitch(chord, 3, 2), 0.3, 0.2), pan=0.6)

        # bass: one long note per chord, a passing note in the second half
        if s % 16 == 0:
            root = CHORDS[chord][0]
            nxt = CHORDS[PLAN[(s // 16 + 1) % len(PLAN)]][0]
            if sec == "A":
                bass(root, t, 16 * STEP, 0.12, bus["bass"])
            else:
                v = 0.7 if sec == "C" else 0.85
                bass(root, t, 10 * STEP, v, bus["bass"])
                passing = root + 7 if sec == "C" else root + (1 if nxt > root else -1) * 2
                bass(passing, t + 10 * STEP, 6 * STEP, 0.8 * v, bus["bass"])

        # pad: from B on, very soft
        if s % 16 == 0 and sec in ("B", "C"):
            pad(CHORDS[chord][1], t, 16 * STEP, 1.0 if sec == "B" else 1.4, bus["pad"])

    print("mixing", flush=True)
    total = N + TAIL
    # section loudness: the solo line sits quieter, the web pushes forward (like the reference shape)
    tt = np.arange(total) / SR
    step_f = tt / STEP
    level = np.interp(step_f, [0, 60, 68, 120, 132, 220, 232, 280, STEPS, STEPS + 30],
                      [0.7, 0.7, 0.85, 0.85, 1.15, 1.15, 0.9, 0.85, 0.7, 0.7])
    mix = [np.zeros(total), np.zeros(total)]
    send = [np.zeros(total), np.zeros(total)]
    dsend = [np.zeros(total), np.zeros(total)]
    plan = {"keys": (1.0, 0.35, 0.25), "bass": (1.0, 0.08, 0.0), "pad": (1.0, 0.5, 0.0)}
    for name, (g, rv, dl) in plan.items():
        for c, ch in enumerate((bus[name].l, bus[name].r)):
            ch = ch * level
            mix[c] += g * ch
            send[c] += rv * ch
            dsend[c] += dl * ch
    for c, d in enumerate((int(3 * STEP * SR), int(5 * STEP * SR))):
        mix[c] += 0.3 * fb_delay(fft_filter(dsend[c], lo=300, hi=3500), d, 0.33)
    print("reverb", flush=True)
    for c in (0, 1):
        mix[c] += 0.4 * reverb(send[c], 2.6, c + 1)

    out = np.stack([m[:N].copy() for m in mix])
    for c in (0, 1):
        out[c, :TAIL] += mix[c][N:]

    # a whisper of tape hiss keeps the silence alive
    out += fft_filter(rng.standard_normal((2, N)).ravel(), lo=2000, hi=9000).reshape(2, N) * 0.0012

    out = np.tanh(1.1 * out / np.max(np.abs(out)) * 0.9) / np.tanh(1.1 * 0.9)
    out = np.stack([fft_filter(c, lo=30, hi=11000) for c in out])
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
