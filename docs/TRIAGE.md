# Issue triage

A lightweight, repeatable pass for every new issue. The goal is that anyone (you, a contributor, or Copilot) can look at an issue and know its type, size, which release line it can ship in, and what it's waiting on - without re-reading the whole thread.

Triage does not decide *when* work happens. It records enough structure that planning is cheap later.

Related docs:
- [`docs/RELEASING.md`](RELEASING.md) for the SemVer policy that drives the `semver:*` label.
- [`docs/SPEC.md`](SPEC.md) for product requirements and acceptance criteria.

## When to triage

Triage an issue when it's filed (or when you next see an untriaged one). It's fast - aim for under a minute per issue once the labels exist. Re-triage if its scope changes (e.g. a `question` resolves into a behavioral change and its `semver:*` shifts).

## The checklist

For each issue, in order:

1. **Read and dedup-check.** Search existing open/closed issues and PRs for the same concern. If it's a duplicate, label `duplicate`, link the original, and close.
2. **Type label.** Exactly one: `bug`, `enhancement`, `documentation`, or `question`.
3. **Release-type label.** One `semver:*` (see table below) capturing which release line the *fix* can ship in. If unknown (common for `question` issues), leave it off until the resolution is clear, then add it.
4. **Newcomer suitability.** Add `good first issue` only if the work is genuinely small and self-contained.
5. **Dependencies.** If the issue is blocked, add a one-line "Blocked by #N" to its body. If it blocks others, note that on the dependents.
6. **Milestone or backlog.** Assign a milestone only when the issue is scheduled for a release line (see Milestones below). Otherwise leave it unmilestoned - that *is* the backlog.

## Labels

The repo ships GitHub's defaults plus the `semver:*` labels below.

| Label | Axis | Meaning |
|---|---|---|
| `bug` | type | Something isn't working |
| `enhancement` | type | New feature or request |
| `documentation` | type | Docs-only change |
| `question` | type | Needs a decision before it's actionable |
| `duplicate` | disposition | Already filed elsewhere; close with a link |
| `wontfix` | disposition | Decided not to do |
| `good first issue` | suitability | Small, self-contained, newcomer-friendly |
| `semver:patch` | release type | Bug/doc/internal fix, no surface change |
| `semver:minor` | release type | New command, setting, or feature; no breaking change |
| `semver:major` | release type | Breaking config, command API, or on-disk format change |

Notes:
- `semver:*` is a **planning-time** signal ("which train *can* this ride?"). It is not the same as recording which release an issue shipped in - Milestones do that.
- These axes are orthogonal: type, release-type, and suitability are independent and an issue carries one of each where applicable.

### Why no size/value labels

We deliberately do **not** use labels like `quick-win` or `high-roi`. Labels are for *durable, categorical* facts - true regardless of who is looking, stable over time. Size and value are subjective valuations: relative, they age, and two people rank them differently. That belongs in a planning view you can reorder, not stamped on an issue as a category. `good first issue` is the one near-objective exception (newcomer suitability), so it stays.

## SemVer quick reference

From [`docs/RELEASING.md`](RELEASING.md):

- **patch** (`v0.3.1`) - bug fixes, doc corrections, internal/CI work. No new commands, settings, or configuration surface.
- **minor** (`v0.4.0`) - new commands, new settings, new user-facing behavior. No breaking changes to existing config.
- **major** (`v1.0.0`) - breaking changes to commands, settings keys, or on-disk formats (e.g. wikilink syntax changes that break existing vaults).

## Milestones

Milestones are **release trains, version-named** - not themed batches.

- `v0.3.x` - the current patch line. Holds patch-level work (bug fixes, doc corrections, internal/CI) that ships in rolling patch cuts.
- `v0.4.0` - the next minor. Park feature work here as it comes up.

Keep the *theme* on the epic issue, not the milestone name - a release train is heterogeneous. An issue shows both its milestone and its labels, so planning visibility doesn't suffer.

## Asking Copilot to triage

You can hand triage off per issue:

> Triage #N against `docs/TRIAGE.md`.

Copilot should walk the checklist: propose a type label, a `semver:*` (or flag that it's undecidable yet and why), a `good first issue` call where apt, a dup-check result, any blockers, and a milestone-or-backlog call - then make the changes or list them for your approval.
