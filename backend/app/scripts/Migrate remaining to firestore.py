"""Copy the remaining SQLite tables into Firestore.

Follows the same conventions as the other migrate_*_to_firestore.py scripts:
  - collection name = table name
  - document ID     = str(id)
  - an "id" field is also stored inside each document
  - foreign keys stay as plain integers (no joins in Firestore)

Run from the backend/ folder (the same way you ran the other scripts):

    python -m app.scripts.migrate_remaining_to_firestore --dry-run
    python -m app.scripts.migrate_remaining_to_firestore
    python -m app.scripts.migrate_remaining_to_firestore --only users,agents

Safe to re-run: each document is written by ID, so a second run overwrites
instead of duplicating. (That also means it overwrites any document that
already exists under the same ID, so check that the target collections are
empty or contain only migrated data.)
"""

import argparse
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(dotenv_path=Path(__file__).resolve().parents[2] / ".env")

from sqlalchemy import func, inspect as sa_inspect

from app.database import SessionLocal
from app import models
from app.firestore_db import db

# A Firestore batch holds up to 500 writes; stay below that.
BATCH_SIZE = 400

# (collection name, SQLAlchemy model, columns to leave out).
# Ordered so that parent tables come before the tables that reference them.
TABLES = [
    # password_hash is unused now that Firebase Auth handles passwords,
    # so it is not copied into Firestore.
    ("users", models.User, {"password_hash"}),
    ("agents", models.Agent, set()),
    ("disease_reports", models.DiseaseReport, set()),
    ("emerging_disease_reports", models.EmergingDiseaseReport, set()),
    ("agent_issue_reports", models.AgentIssueReport, set()),
    ("predictions", models.Prediction, set()),
    ("taluk_adjacency", models.TalukAdjacency, set()),
    ("activity_logs", models.ActivityLog, set()),
    ("notifications", models.Notification, set()),
    ("home_relief_remedies", models.HomeReliefRemedy, set()),
    ("home_relief_safety_rules", models.HomeReliefSafetyRule, set()),
    ("home_relief_alternatives", models.HomeReliefAlternative, set()),
    ("home_relief_audit_logs", models.HomeReliefAuditLog, set()),
]


def row_to_doc(row, skip):
    """Turn a SQLAlchemy row into a plain dict of its column values."""
    mapper = sa_inspect(row).mapper
    return {
        attr.key: getattr(row, attr.key)
        for attr in mapper.column_attrs
        if attr.key not in skip
    }


def firestore_count(collection_name):
    result = db.collection(collection_name).count().get()
    return result[0][0].value


def bump_counter(collection_name, max_id):
    """Keep the _counters/<collection> doc (used by an ID counter) at or above
    the highest migrated ID, without ever lowering an existing value."""
    ref = db.collection("_counters").document(collection_name)
    snap = ref.get()
    current = snap.get("last_id") if snap.exists else 0
    ref.set({"last_id": max(current, max_id)})


def migrate_table(session, name, model, skip):
    batch = db.batch()
    pending = 0
    written = 0
    max_id = 0

    for row in session.query(model).order_by(model.id).yield_per(500):
        batch.set(db.collection(name).document(str(row.id)), row_to_doc(row, skip))
        pending += 1
        written += 1
        max_id = max(max_id, row.id)

        if pending >= BATCH_SIZE:
            batch.commit()
            batch = db.batch()
            pending = 0

    if pending:
        batch.commit()

    if written:
        bump_counter(name, max_id)

    return written


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="only print the SQLite row counts; write nothing",
    )
    parser.add_argument(
        "--only",
        help="comma-separated collection names to migrate (default: all)",
    )
    args = parser.parse_args()

    selected = None
    if args.only:
        selected = {n.strip() for n in args.only.split(",") if n.strip()}
        known = {name for name, _, _ in TABLES}
        unknown = selected - known
        if unknown:
            raise SystemExit(f"Unknown collection(s): {', '.join(sorted(unknown))}")

    session = SessionLocal()
    try:
        results = []
        for name, model, skip in TABLES:
            if selected and name not in selected:
                continue

            sqlite_count = session.query(func.count(model.id)).scalar()

            if args.dry_run:
                print(f"[dry-run] {name}: {sqlite_count} rows in SQLite")
                continue

            written = migrate_table(session, name, model, skip)
            print(f"Migrated {written} rows into '{name}'.")
            results.append((name, sqlite_count))

        if results:
            print("\nVerification (SQLite vs Firestore):")
            for name, sqlite_count in results:
                fs_count = firestore_count(name)
                status = "OK" if fs_count >= sqlite_count else "MISMATCH"
                print(f"  {name}: SQLite={sqlite_count} Firestore={fs_count} [{status}]")
    finally:
        session.close()


if __name__ == "__main__":
    main()