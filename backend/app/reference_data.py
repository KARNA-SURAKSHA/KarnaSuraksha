"""Cached read access to fixed reference data stored in Firestore.

States, districts and taluks are fixed reference data (no endpoint
creates or edits them), so each collection is loaded once and served
from memory. Returned dicts are shared - treat them as read-only.
"""

import threading

from .firestore_db import db as firestore_db

_lock = threading.Lock()
_cache = {}


def _key(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _load(collection):
    with _lock:
        if collection not in _cache:
            _cache[collection] = {
                int(doc.id): doc.to_dict()
                for doc in firestore_db.collection(collection).stream()
                if doc.id.isdigit()
            }
        return _cache[collection]


def clear_cache():
    """Force a reload from Firestore on next access."""
    with _lock:
        _cache.clear()


def get_state(state_id):
    return _load("states").get(_key(state_id))


def get_district(district_id):
    return _load("districts").get(_key(district_id))


def get_taluk(taluk_id):
    return _load("taluks").get(_key(taluk_id))


def get_district_for_taluk(taluk_id):
    taluk = get_taluk(taluk_id)
    return get_district(taluk["district_id"]) if taluk else None


def all_taluks():
    return sorted(
        _load("taluks").values(),
        key=lambda t: t.get("name", ""),
    )


def taluks_in_district(district_id):
    key = _key(district_id)
    return [
        t for t in all_taluks()
        if t.get("district_id") == key
    ]


def taluk_ids_in_district(district_id):
    return [t["id"] for t in taluks_in_district(district_id)]