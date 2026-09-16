"""Private aggregate report: python -m server.analytics_report --days 7."""
import argparse
import json
import sqlite3
import time
from collections import Counter, defaultdict

from server.analytics import DB_PATH, purge


def report(days):
    purge()
    db = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    try:
        rows = db.execute("SELECT session, seq, event, props FROM events WHERE created >= ? ORDER BY session, seq", (int(time.time()) - days * 86400,)).fetchall()
    finally:
        db.close()
    counts, sessions, segments = Counter(), defaultdict(set), Counter()
    sequences = defaultdict(list)
    for session, seq, event, raw in rows:
        props = json.loads(raw)
        counts[event] += 1
        sessions[event].add(session)
        segments[(event, props["page"], props["locale"], props.get("platform", ""), props.get("placement", ""), props.get("target", ""))] += 1
        sequences[session].append((event, props))

    def funnel(steps, page=None):
        totals = [0] * len(steps)
        for sequence in sequences.values():
            progress = 0
            for event, props in sequence:
                if page and props["page"] != page:
                    continue
                expected, filters = steps[progress]
                if event == expected and all(props.get(k) == v for k, v in filters.items()):
                    totals[progress] += 1
                    progress += 1
                    if progress == len(steps):
                        break
        return [{"step": event, "filters": filters, "sessions": count} for (event, filters), count in zip(steps, totals)]

    return {
        "days": days,
        "scope": "Consenting website sessions only; store clicks do not prove installs or bookings.",
        "events": [{"event": event, "count": count, "sessions": len(sessions[event])} for event, count in sorted(counts.items())],
        "segments": [{"event": k[0], "page": k[1], "locale": k[2], "platform": k[3], "placement": k[4], "target": k[5], "count": v} for k, v in sorted(segments.items())],
        "funnels": {
            "website_store": funnel([("page_view", {}), ("store_click", {})]),
        },
        "measurement": "Funnels count each document session once per ordered step using client sequence, allowing intervening events. Sessions reset on each document load. Declined consent and blocked/lost requests are unobserved.",
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--days", type=int, choices=range(1, 91), default=7)
    args = parser.parse_args()
    try:
        print(json.dumps(report(args.days), indent=2))
    except (ValueError, OSError, sqlite3.Error):
        parser.exit(1, "Analytics storage is unavailable.\n")


if __name__ == "__main__":
    main()
