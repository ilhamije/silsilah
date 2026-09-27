# Fixtures

Sample AI extraction results that match `src/lib/ai/schema.ts`. They are used by
the tests and by `EXTRACTION_MOCK=1` (local development without an API key).

| File | What it is |
|---|---|
| `extraction-valid.json` | Page 1 of a three-generation Indonesian family tree: bin/binti names, a marriage, a death, one illegible name, one low-confidence date, unclear notes |
| `extraction-page2.json` | Page 2 of the same tree. Reuses Rahmat's id `p5` from page 1 and adds his wife and children with ids that collide with page 1 (`p1`–`p3`), to test id scoping |
| `extraction-rejected.json` | A receipt: `is_family_tree: false` |
| `extraction-borderline.json` | A list of names with no relationships and low confidence |

The two overlapping trees for merge detection are added in phase 5.
