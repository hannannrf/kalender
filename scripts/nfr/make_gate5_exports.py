"""Gate 5 exports (S13-1): the SE-3D sample export moved forward so that its last message,
"Meeting tomorrow at 3pm", was sent today. Writes a first export, and a newer export that adds
the sample's "kal 5 baje project meeting hai" at the same minute (the Possible Duplicate case).
Dates inside the text (dd/mm) move by the same number of days.
Usage: python -I scripts/nfr/make_gate5_exports.py <out dir>"""
import os
import re
import sys
from datetime import date, datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
SAMPLE = os.path.join(HERE, "..", "..", "fixtures", "exports", "samples", "WhatsApp Chat with SE-3D Class.txt")
NAME = "WhatsApp Chat with SE-3D Class.txt"
shift = datetime.now(timezone(timedelta(hours=5))).date() - date(2026, 10, 19)


def move(m):
    d, mo, y = int(m.group(1)), int(m.group(2)), m.group(3)
    new = date(int(y) if y else 2026, mo, d) + shift
    return f"{new:%d/%m/%Y}" if y else f"{new:%d/%m}"


def moved(line):
    return re.sub(r"\b(\d{2})/(\d{2})(?:/(\d{4}))?\b", move, line)


lines = [moved(l) for l in open(SAMPLE, encoding="utf-8").read().splitlines()]
out = sys.argv[1]
for folder, extra in (("v1", []), ("v2", [lines[-1].split(" - ")[0] + " - Bilal: kal 5 baje project meeting hai"])):
    os.makedirs(os.path.join(out, folder), exist_ok=True)
    with open(os.path.join(out, folder, NAME), "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(lines + extra) + "\n")
