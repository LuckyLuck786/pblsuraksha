"""
SURAKSHA - Complaint Utilities
Geocoding helper using Nominatim (OpenStreetMap) — no API key required.
"""

import logging

logger = logging.getLogger('apps.complaints')

_NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
_USER_AGENT    = 'SURAKSHA-SafetyPlatform/1.0 (public-safety-app)'
_TIMEOUT       = 6   # seconds


def geocode_location(primary: str, fallback: str = '') -> tuple:
    """
    Convert a text address to (latitude, longitude) using the Nominatim
    (OpenStreetMap) geocoding API — no API key required.

    Tries `primary` first; if that returns nothing, tries `fallback`.
    Results are biased toward India (countrycodes=in).

    Returns:
        (float, float)  — (lat, lon) on success
        (None,  None)   — when both attempts fail or network is unavailable
    """
    try:
        import requests as _requests
    except ImportError:
        logger.warning('Geocoding unavailable: requests package not installed.')
        return None, None

    for location_text in filter(None, [primary.strip(), fallback.strip()]):
        query = f"{location_text}, India"
        try:
            resp = _requests.get(
                _NOMINATIM_URL,
                params={
                    'q'            : query,
                    'format'       : 'json',
                    'limit'        : 1,
                    'countrycodes' : 'in',
                    'addressdetails': 0,
                },
                headers={'User-Agent': _USER_AGENT},
                timeout=_TIMEOUT,
            )
            resp.raise_for_status()
            data = resp.json()
            if data:
                lat = float(data[0]['lat'])
                lon = float(data[0]['lon'])
                logger.info(
                    f'Geocoded "{location_text[:70]}" → ({lat:.5f}, {lon:.5f})'
                )
                return lat, lon
            logger.debug(f'Geocoding: no results for "{location_text[:70]}"')
        except Exception as exc:
            logger.warning(
                f'Geocoding error for "{location_text[:70]}": '
                f'{type(exc).__name__}: {exc}'
            )

    logger.warning(
        f'Geocoding: all attempts failed '
        f'(primary="{primary[:60]}", fallback="{fallback[:60]}")'
    )
    return None, None
