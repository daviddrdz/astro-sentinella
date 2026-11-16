# Backend unit tests

Run from the repository root after installing `backend/requirements.txt`:

```sh
python -m pytest -c backend/tests/pytest.ini backend/tests -q
```

Or from `backend/`:

```sh
python -m pytest tests -q
```

The suite covers all three GET endpoints, query validation, metadata aggregation,
frame ordering and selection, FITS processing, PNG rendering, archive retries,
cache expiration and concurrency, and rate limits. External calls are mocked and
network access is blocked during tests. Temporary FITS files are generated locally.
All backend tests live in this directory, including the original endpoint tests.

Known regressions are marked `xfail(strict=True, raises=AssertionError)`:
unexpected errors returning HTML, non-YYYY-MM-DD dates being accepted, and
multiple timeline frames downloading the same earliest image. These tests run
and report expected failures; remove the corresponding marker when fixing each
bug. An unexpected pass fails the suite so the marker cannot silently become stale.
Use `python -m pytest tests -q -rx` from `backend/` to see the reasons, or add
`--runxfail` to run them as ordinary failing tests.
