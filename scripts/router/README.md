# Auto-router tooling

Scripts that work with the complexity-based auto router
(`docs/api/auto-routing.md`).

| Script | What it does |
|--------|--------------|
| `replay.py` | Re-scores captured traffic through `POST /admin/routing/score` (dry run) and reports tier distribution, selected models and projected vs. actual cost. Can emit per-request feature rows as JSONL for training. |

`replay.py` needs only the standard library when reading from a JSONL file;
reading from `request_logs` needs `pip install "psycopg[binary]"` and
`DATABASE_URL`. Payload capture (`AURA_PAYLOAD_CAPTURE=on` plus the org
setting) must have been on for rows to have a `request_body`.
