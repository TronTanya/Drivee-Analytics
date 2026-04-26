"""Фразы охвата: «по всем городам» = вся сеть, не группировка по city_id."""

from __future__ import annotations

import re

# Совпадает с «по всем городам», «во всех городах», «для всех городов» и т.п.
RE_AGGREGATE_ACROSS_ALL_CITIES = re.compile(
    r"по\s+всем\s+город|всех\s+город|все\s+город\b|все\s+города|(?:по|для|во)\s+все[мх]?\s+город|(всем|всех|все)\s+город",
    re.IGNORECASE,
)


def implies_aggregate_across_all_cities(query: str) -> bool:
    return bool(RE_AGGREGATE_ACROSS_ALL_CITIES.search(query.strip()))
