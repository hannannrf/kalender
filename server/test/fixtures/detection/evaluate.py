"""
Scores a detector's output against the Detection Test Set (PRD v1.1, NFR-05 / AC-05.8).

Usage:  python3 evaluate.py detection_test_set.csv detector_output.csv

detector_output.csv columns:
  id, detected (Y/N), needs_date (Y/N), date (YYYY-MM-DD), time (HH:MM | ALLDAY), uncertain (date;time;event)

Thresholds are the ones proposed to Mahd (OQ-03). If he changes them, edit THRESHOLDS only.
"""
import csv
import sys

THRESHOLDS = {
    "M1_recall_per_language": 0.90,   # E-EN and E-RU each
    "M2_interpretation": 0.90,        # correct date and start time among detected E messages
    "M3_detected_ambiguous": 0.90,    # A messages that produce a Detected Event
    "M3_flagged": 1.00,               # detected A messages carrying the required Uncertain marks / Needs date
    "M4_max_false_suggestions": 4,    # of 20 Non-Event messages
    "M4_max_past": 0,                 # of the past-reference Non-Event messages
}
PAST = {"N01", "N04", "N05", "N07", "N11", "N15", "N16", "N20"}


def load(path):
    with open(path, newline="", encoding="utf-8") as f:
        return {r["id"]: r for r in csv.DictReader(f)}


def marks(s):
    return {x for x in (s or "").split(";") if x}


def evaluate(truth, out, verbose=True):
    def det(i):
        return out.get(i, {}).get("detected", "N") == "Y"

    report, passed = [], True

    # M1 recall per language
    for g in ("E-EN", "E-RU"):
        ids = [i for i, r in truth.items() if r["group"] == g]
        hit = [i for i in ids if det(i)]
        rate = len(hit) / len(ids)
        ok = rate >= THRESHOLDS["M1_recall_per_language"]
        passed &= ok
        report.append((f"M1 recall {g}", f"{len(hit)}/{len(ids)} = {rate:.0%}", "≥ 90%", ok,
                       [i for i in ids if i not in hit]))

    # M2 interpretation accuracy on detected clear Event messages
    ids = [i for i, r in truth.items() if r["group"] in ("E-EN", "E-RU") and det(i)]
    right = [i for i in ids if out[i]["date"] == truth[i]["date"] and out[i]["time"] == truth[i]["time"]]
    rate = len(right) / len(ids) if ids else 0
    ok = rate >= THRESHOLDS["M2_interpretation"]
    passed &= ok
    report.append(("M2 correct date + time", f"{len(right)}/{len(ids)} = {rate:.0%}", "≥ 90%", ok,
                   [i for i in ids if i not in right]))

    # M3 ambiguous messages: detected, and flagged
    ids = [i for i, r in truth.items() if r["group"] == "A"]
    hit = [i for i in ids if det(i)]
    rate = len(hit) / len(ids)
    ok = rate >= THRESHOLDS["M3_detected_ambiguous"]
    passed &= ok
    report.append(("M3 ambiguous detected", f"{len(hit)}/{len(ids)} = {rate:.0%}", "≥ 90%", ok,
                   [i for i in ids if i not in hit]))

    def flagged(i):
        t, o = truth[i], out[i]
        if t["needs_date"] == "Y" and o.get("needs_date") != "Y":
            return False
        return marks(t["uncertain"]) <= marks(o.get("uncertain"))

    good = [i for i in hit if flagged(i)]
    rate = len(good) / len(hit) if hit else 0
    ok = rate >= THRESHOLDS["M3_flagged"]
    passed &= ok
    report.append(("M3 uncertainty flagged", f"{len(good)}/{len(hit)} = {rate:.0%}", "100%", ok,
                   [i for i in hit if i not in good]))

    # M4 non-events
    ids = [i for i, r in truth.items() if r["group"] == "N"]
    fp = [i for i in ids if det(i)]
    ok = len(fp) <= THRESHOLDS["M4_max_false_suggestions"]
    passed &= ok
    report.append(("M4 false suggestions", f"{len(fp)}/20", "≤ 4", ok, fp))
    past = [i for i in fp if i in PAST]
    ok = len(past) <= THRESHOLDS["M4_max_past"]
    passed &= ok
    report.append(("M4 past-reference detected", f"{len(past)}/{len(PAST)}", "0", ok, past))

    if verbose:
        print(f"{'Metric':30} {'Result':16} {'Target':8} Pass  Failing IDs")
        for name, res, tgt, ok, bad in report:
            print(f"{name:30} {res:16} {tgt:8} {'PASS' if ok else 'FAIL':5} {', '.join(bad)}")
        print("\nFR-05 detection:", "ACCEPTED" if passed else "NOT ACCEPTED (fix detection and re-run)")
    return passed


if __name__ == "__main__":
    evaluate(load(sys.argv[1]), load(sys.argv[2]))
