# Python pipeline development

Create an isolated environment from the repository root:

```bash
python3 -m venv .venv
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r pipelines/requirements-dev.txt
.venv/bin/python -m pytest pipelines
```

Python pipelines may access infrastructure through narrow, validated contracts. They must not expose provider response shapes to TypeScript domain modules. The historical-data pipeline uses `nflreadpy` only for the reviewed nflverse weekly player-statistics dataset; see its dataset-specific licensing and attribution review before enabling any other loader.
