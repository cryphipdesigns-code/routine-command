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
- Neutral day exemptions and allowance-day swaps
- Opt-in Web Push: evening Build check-ins, logged slips/skips, and evidence-based pattern nudges
- Configurable direct/relentless original challenges with short, sourced motivational quotes

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
- `supabase/functions/routine-command-push/` — authenticated push subscription and delivery service
- `scripts/configure-push.mjs` — first-time push credentials, through stdin into Supabase secrets and Vault

## Push notifications

The browser's permission prompt must be enabled from Settings → Command notifications.
On iPhone, use the installed Home Screen app on iOS 16.4 or later. The phone must
receive a real test push to confirm delivery; browser automation alone cannot
verify the owner's device.

The existing Supabase project runs a five-minute cron check. Slips and explicit
skips also request immediate dispatch after the state is synced. Quiet hours,
category toggles, exemptions, start dates, optional habits, and a four-per-device
daily cap apply. Delivery is deduplicated atomically in Postgres. Missing records
are called unconfirmed; they are never presented as proof of a skipped action.
Push permission and coaching preferences are opt-in; Daily Signals are excluded.

First deployment uses the linked Routine Command project only:

```bash
npx supabase db push --linked
node scripts/configure-push.mjs
npx supabase functions deploy routine-command-push --project-ref xevhawcjknatepvsigyf --use-api
```

The setup helper preserves existing VAPID keys, stores no private key files, and
feeds credentials into CLI stdin. Function JWT verification is disabled at the
gateway because scheduled jobs use a separate Vault credential. The function
itself verifies user JWTs for all subscription, dispatch, and test operations;
only public VAPID configuration is anonymous. Push endpoints are restricted to
known browser push services. Private subscription and delivery tables are not
accessible to browser roles. Do not deploy with `--prune` or modify other projects.

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
limits each cloud record to its authenticated owner. Authentication sessions use
first-party cookies so supported iPhones retain sign-in when the app is added to
the Home Screen.
