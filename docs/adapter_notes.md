# Adapter Notes

All benchmark adapters should emit the repository JSONL trajectory schema. Keep benchmark-specific details inside `metadata` so cross-benchmark metrics remain comparable.

## OSWorld

Map each GUI command to one executable step:

- click
- type
- press
- hotkey
- scroll
- drag
- open_app
- submit
- observe
- think
- reflect

Recommended metadata:

- app name
- task instruction
- screenshot path
- accessibility tree path
- raw action string
- model name
- token counts

## Mind2Web / WebArena

For web tasks, include:

- URL/domain
- DOM element id or XPath
- candidate id
- operation type
- screenshot path
- whether the action is externally visible

## Risk Labels

- `safe`: local navigation, field focus, typing into unsent fields
- `state_changing`: settings changes, file edits, form edits
- `irreversible`: delete, overwrite, destructive operations
- `external`: send email, submit order, publish, pay, share

