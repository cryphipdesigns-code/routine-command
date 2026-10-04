# Routine Command

Routine Command is a mobile-first habit and daily wellbeing app. It borrows the calm,
glass-panel visual language of the Command apps while keeping its habit logic,
storage, and source code completely separate from Cash Command and Reef Command.

## Included in the MVP

- Boolean and quantitative habits
- At-least, at-most, between, and exact numeric targets
- Per-weekday schedules with visibly neutral rest days
- Optional, color-matched habits that do not lower adherence
- Versioned rules so target changes do not rewrite historical adherence
- One-tap daily completion and fast numeric entry
- Mood, productivity, optional energy, wake time, bedtime, and a short daily note
- Weekly habit grid and monthly consistency calendar
- 30-day adherence and wellbeing trends
- IndexedDB persistence with local-storage fallback
- Private Supabase authentication and cross-device sync
- JSON backup and restore
- Responsive desktop sidebar and mobile bottom navigation
- Installable PWA shell and offline asset cache
- Supabase Row Level Security that isolates every user's records

The app starts with editable daily yes/no habits for **15 min Read**,
**15 min Read Bible**, **BOM**, and **Cold**, alongside the existing examples.
It includes no example history.

## Run locally

```bash
npm install
npm run dev
```

Open <http://localhost:4175/>.

## Verify

```bash
npm test
npm run build
```

Preview the production build with:

```bash
npm run preview
```

## Structure

- `src/domain/` — dates, applicability, target evaluation, and adherence
- `src/data/` — starter data and browser persistence
- `src/state/` — mutations, rule versioning, imports, and persistence sequencing
- `src/views/` — one renderer per main application area
- `src/app.ts` — interaction routing, forms, backup, and restore
- `public/` — PWA manifest, icon, and service worker
- `tests/` — deterministic compliance tests
- `supabase/migrations/` — private cloud-state schema

## Compliance semantics

Unscheduled and future days never count against adherence. A scheduled past day
without a successful entry is missed. Today stays pending until it is completed
or the local day ends. Numeric values remain visible even when they do not meet
their target.

Changing a schedule, target, recording type, or unit creates a rule boundary
effective on the current day. Existing historical dates continue to use the
rule that was active then.

## Storage and sync

Routine Command remains local-first: records are stored immediately in the
browser's existing IndexedDB database named `tracker-local`, so prior Daymark data
is retained. When a user signs in with a secure email link, the current local
state is adopted by Supabase and kept in sync across devices. Row Level Security
limits each cloud record to its authenticated owner.
