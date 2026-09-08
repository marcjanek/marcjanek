#!/usr/bin/env python3
"""Source for assets/2137.txt. Hand-run, never part of the build.

scripts/build.mjs has to run in Cloudflare's build environment, so it stays
zero-dependency and cannot do this; like scripts/og-card.html, this is a tool
that produces a committed artefact rather than a step that runs on deploy.

    python3 -m pip install pillow numpy
    python3 scripts/ascii-2137.py > assets/2137.txt

Why the parameters are what they are:

  CELL   a JetBrains Mono cell is 0.6em wide, and the art is drawn at
         line-height 1, so a character is 1/0.6 = 1.667x taller than it is
         wide. Rows are divided by that or the portrait comes out stretched.
  LO     the black point. The backdrop of this photo is a mid-tone, not black,
         so without it the whole background renders as visible characters and
         the portrait never separates from it. 0.62 is just above the
         backdrop's luminance, which drops it to spaces.
  RAMP   ASCII only. assets/fonts.css subsets the font to U+0000-00FF and up,
         and nothing on this page may draw from the OS fallback -- see the note
         at the top of that file. Ordered sparse to dense: the terminal is dark,
         so a *brighter* pixel needs a *denser* glyph.
  COLS   120 keeps the face legible once the block is scaled down to fit the
         shell window. The file is not inlined into index.html, so its size is
         off the 150 KB first-view budget and resolution is close to free.
  CROP   the shell window is wide and short -- roughly 1100x380 on a desktop
         and 250x260 on a phone -- so height is what binds, and a portrait-
         shaped block shrinks to characters under 3px. This crop is 120x58,
         which lands at 5.5px on a desktop and 3.4px on a phone. The full-
         length original was tried at 120x73 and is muddy on a phone.
"""

import sys

import numpy as np
from PIL import Image, ImageEnhance, ImageOps

SRC = ("https://static.wikia.nocookie.net/nowa-przyszlosc/images/0/0f/"
       "Jan_Pawe%C5%82.jpg/revision/latest/scale-to-width-down/1000"
       "?cb=20190924132209&path-prefix=pl")
CROP = (110, 35, 890, 660)   # head and shoulders out of the 1000x1201 original
COLS, CELL, LO, SHARP = 120, 1.667, 0.62, 2.2
RAMP = " .`',:;i!ltfLCG08@"


def main(path):
    im = Image.open(path).convert("RGB").crop(CROP)
    w, h = im.size
    rows = round(h / w * COLS / CELL)
    g = ImageEnhance.Sharpness(ImageOps.grayscale(im)).enhance(SHARP)
    g = g.resize((COLS, rows), Image.LANCZOS)
    v = np.clip((np.asarray(g, np.float32) / 255.0 - LO) / (1 - LO), 0, 1)
    idx = np.clip(np.round(v * (len(RAMP) - 1)).astype(int), 0, len(RAMP) - 1)
    for row in idx:
        # trailing blanks are invisible and the file is fetched over the wire
        print("".join(RAMP[i] for i in row).rstrip())


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(f"usage: {sys.argv[0]} <image>   # source: {SRC}")
    main(sys.argv[1])
