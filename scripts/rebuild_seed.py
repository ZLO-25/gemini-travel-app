#!/usr/bin/env python3
"""
Rebuild `js/seed-bundle.js` from `data/manifest.json` and `data/trips/*.json`.
Run this script after adding or updating any trip JSON file so offline/first-load seed stays up to date!
"""
import json
import os
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MANIFEST_PATH = os.path.join(ROOT, "data", "manifest.json")
SEED_OUT_PATH = os.path.join(ROOT, "js", "seed-bundle.js")


def main():
    with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    trips = []
    for entry in manifest.get("trips", []):
        rel_file = entry.get("file", "")
        full_path = os.path.join(ROOT, rel_file.replace("/", os.sep))
        if not os.path.exists(full_path):
            raise FileNotFoundError(f"Trip file listed in manifest not found: {rel_file}")
        with open(full_path, "r", encoding="utf-8") as tf:
            trips.append(json.load(tf))

    default_id = manifest.get("defaultTripId") or (trips[0]["id"] if trips else "")
    bundle = {
        "version": 2,
        "activeTripId": default_id,
        "syncedAt": datetime.now(timezone.utc).isoformat(),
        "trips": trips,
    }

    with open(SEED_OUT_PATH, "w", encoding="utf-8") as out:
        out.write("/* Auto-generated offline seed bundle — run `python scripts/rebuild_seed.py` to update */\n")
        out.write("window.__TRAVEL_SEED_BUNDLE__ = ")
        json.dump(bundle, out, ensure_ascii=False)
        out.write(";\n")

    print(f"Updated {SEED_OUT_PATH} with {len(trips)} trip(s): {[t['id'] for t in trips]}")


if __name__ == "__main__":
    main()
