"""NFR-02 test exports (S13-2): Android .txt Chat Exports of 10,000 lines each, with 300 messages
inside the default 7-day Look-back and the rest older. About one in ten messages in the window is an
Event Message with a future date, in English or Roman Urdu. All names and texts are made up.
Usage: python -I scripts/nfr/make_nfr02_exports.py <out dir> [count]"""
import os
import random
import sys
from datetime import datetime, timedelta, timezone

PKT = timezone(timedelta(hours=5))
NNBSP = " "  # Android writes a narrow no-break space before am/pm
LINES, WINDOW = 10_000, 300
SENDERS = ["CR Usman", "Hira", "Bilal", "Ayesha", "Danish", "Sana"]
CHATTER = [
    "anyone has the slides?", "ok", "noted", "thanks", "kis ne notes banaye hain?", "<Media omitted>",
    "sir aaj late aayenge", "group photo bhejo", "This message was deleted", "lab manual upload kar do",
    "kya scene hai", "done", "jazakAllah", "check LMS", "attendance lag gayi?",
]


def stamp(t):
    h = t.hour % 12 or 12
    return f"{t:%d/%m/%Y}, {h}:{t:%M}{NNBSP}{'am' if t.hour < 12 else 'pm'}"


def event_text(rnd, now):
    d = now + timedelta(days=rnd.randint(3, 20))
    dm = f"{d:%d/%m}"
    return rnd.choice([
        f"Quiz {rnd.randint(1, 9)} on {dm} at 10am in Room C-{rnd.randint(100, 399)}",
        f"Assignment {rnd.randint(1, 9)} due {dm} by midnight",
        f"{dm} ko 3 baje project meeting hai",
        f"Presentation {dm} ko subah 11 baje hogi",
        f"Society core meetup on {dm} at 5pm",
    ])


def make(path, n, now):
    rnd = random.Random(n)
    old_start, old_end = now - timedelta(days=90), now - timedelta(days=8)
    window_start, window_end = now - timedelta(days=6, hours=20), now - timedelta(minutes=10)
    lines = [f"{stamp(old_start)} - Messages and calls are end-to-end encrypted. No one outside of this chat, not even WhatsApp, can read or listen to them. Tap to learn more."]
    old_count = LINES - WINDOW - 1
    for i in range(old_count):
        t = old_start + (old_end - old_start) * (i / old_count)
        lines.append(f"{stamp(t)} - {rnd.choice(SENDERS)}: {rnd.choice(CHATTER)}")
    for i in range(WINDOW):
        t = window_start + (window_end - window_start) * (i / WINDOW)
        text = event_text(rnd, now) if i % 10 == 0 else rnd.choice(CHATTER)
        lines.append(f"{stamp(t)} - {rnd.choice(SENDERS)}: {text}")
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(lines) + "\n")


if __name__ == "__main__":
    out, count = sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 20
    os.makedirs(out, exist_ok=True)
    now = datetime.now(PKT).replace(second=0, microsecond=0)
    for n in range(1, count + 1):
        make(os.path.join(out, f"WhatsApp Chat with NFR02 Chat {n:02d}.txt"), n, now)
