from datetime import datetime

from . import models
from .firestore_db import db as firestore_db


def _seed_diseases_firestore():
    """Ensure the official disease registry exists in Firestore."""
    diseases_ref = firestore_db.collection("diseases")

    # Find the current max numeric ID so new diseases get sequential IDs
    # (keeps compatibility with anything still expecting integer-like IDs).
    existing_docs = list(diseases_ref.stream())
    existing_names = {
        doc.to_dict().get("name", "").lower()
        for doc in existing_docs
    }
    max_id = max(
        (int(doc.id) for doc in existing_docs if doc.id.isdigit()),
        default=0,
    )

    for name in models.DISEASES:
        if name.lower() not in existing_names:
            max_id += 1
            diseases_ref.document(str(max_id)).set({
                "id": max_id,
                "name": name,
                "description": None,
                "is_active": True,
                "verification_status": "VERIFIED",
                "created_by_user_id": None,
                "verified_by_user_id": None,
                "created_at": datetime.utcnow().isoformat(),
                "verified_at": datetime.utcnow().isoformat(),
            })


def initialize_feature():
    """Ensure the official disease registry exists in Firestore.

    Medical Supervisor accounts are no longer seeded here. They are
    created and managed from the Admin portal (Medical Supervisor
    Management).
    """
    try:
        _seed_diseases_firestore()
    except Exception as exc:  # noqa: BLE001
        # Do not let an unreachable Firestore stop the whole API from booting
        # (login, reports and the spread map only need the local database).
        print(
            "\n[startup] WARNING: could not seed the disease registry in Firestore:\n"
            f"          {type(exc).__name__}: {str(exc).splitlines()[0] if str(exc) else ''}\n"
            "          Pages that read Firestore (districts / disease lists) will fail\n"
            "          until Firestore is enabled for the Firebase project.\n"
        )