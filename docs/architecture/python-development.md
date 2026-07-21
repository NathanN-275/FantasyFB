# Python pipeline development

Create an isolated environment from the repository root:

```bash
python3 -m venv .venv
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r pipelines/requirements-dev.txt
.venv/bin/python -m pytest pipelines
```

Python pipelines may access infrastructure through narrow, validated contracts. They must not expose provider response shapes to TypeScript domain modules. Prompt 5 will add `nflreadpy` to the historical-data pipeline after its dataset licensing review.
