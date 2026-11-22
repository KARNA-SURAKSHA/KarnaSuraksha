from dotenv import load_dotenv
from pathlib import Path

load_dotenv(dotenv_path=Path(__file__).resolve().parents[2] / ".env")

from app.database import SessionLocal
from app import models
from app.firestore_db import db

session = SessionLocal()
try:
    taluks = session.query(models.Taluk).all()

    # A Firestore batch holds up to 500 writes; 237 taluks fit in one.
    batch = db.batch()

    for taluk in taluks:
        batch.set(
            db.collection("taluks").document(str(taluk.id)),
            {
                "id": taluk.id,
                "name": taluk.name,
                "district_id": taluk.district_id,
            },
        )

    batch.commit()

    print(f"Migrated {len(taluks)} taluks.")
finally:
    session.close()