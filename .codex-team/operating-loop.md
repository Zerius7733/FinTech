# Operating Loop

Use this loop for branch `zian`.

## Startup

1. Confirm the current objective.
2. Create the default team if the current objective warrants execution.
3. Assign non-overlapping ownership.

## Execution

1. Developers implement in parallel.
2. QA verifies current behavior and changed behavior.
3. Researcher proposes near-term and medium-term improvements.
4. Manager integrates results and resolves conflicts.
5. Before starting any new queued task, check whether a graceful stop has been requested in the dashboard state.
6. If stop has been requested, finish the current task, update status, and pause the team.

## Replacement policy

- Replace an agent when:
  - their role no longer matches the work
  - they are idle for a full cycle
  - a specialist would materially increase throughput
- Stay under 7 live agents at all times.

## Default first-cycle objective

Establish a clear branch baseline:
- identify highest-value implementation opportunities
- identify highest-risk regressions or testing gaps
- identify 3 practical research bets for this repo
