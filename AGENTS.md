# AGENTS.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

A React + Firebase chore tracking application for households. Single-page app (SPA) using React 18, Vite, Tailwind CSS, and Firebase Firestore. All components are in a single monolithic `App.tsx` file (~4500 lines).

**Key Architecture Decisions:**
- **Single-file architecture**: All components defined in `App.tsx` (no separate component files)
- **Firebase real-time sync**: All data uses `onSnapshot` listeners for real-time updates
- **NoSQL data model**: 9 Firestore collections with explicit relationships
- **No backend logic**: All calculations happen client-side in React components

## Development Commands

**Start development server:**
```bash
npm run dev
```
Server runs at `http://localhost:5173`

**Build for production:**
```bash
npm run build
```
Output goes to `dist/` directory.

**Preview production build:**
```bash
npm run preview
```

**Note:** This project has no linting, testing, or type-checking scripts configured. Changes should be validated manually via the dev server.

## Environment Setup

Firebase configuration is required. Copy `.env.example` to `.env` and populate with your Firebase project credentials:
```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

Firestore collections are created automatically on first use. No database migrations or seed scripts needed.

## Critical Architecture Concepts

### 1. Credit Assignment System (Non-Obvious!)

**Who gets credit for chore completions:**
- Credits go to the person the chore was done FOR (`forPersonId`), NOT the person who did it (`completedBy`)
- When Person A does a chore for Person B, Person B gets the completion credit toward their stats
- This is a core business rule that affects all stats calculations

**Provisional Credits:**
- Cross-person completions create "provisional" credits (`isProvisional: true`) until the debt is paid or expires
- If a debt expires unpaid, the provisional credit is retroactively removed from stats calculations
- Use `calculatePersonStatsWithoutExpiredDebts()` for accurate stats display

### 2. Historical Versioning for Chores and Assignments

**Critical for calculations:**
- Chores can be edited with effective dates, preserving historical values in a `history` array
- Assignments (frequencies) can be edited with effective dates, same pattern
- **Use helper functions for ALL calculations**:
  - `getChoreMinutesAtDate(chore, date)` - NOT `chore.minutes`
  - `getChoreNameAtDate(chore, date)` - NOT `chore.name`
  - `getAssignmentFrequencyAtDate(assignment, date)` - NOT `assignment.timesPerMonth`

**Why:** A chore recorded as 10 minutes on Jan 5 might have been edited to 15 minutes effective Jan 1. The completion still shows 10 minutes (what was actually done), but expected minutes for January use 15 minutes (what was required).

**Example:**
```typescript
// WRONG:
expectedMinutes += chore.minutes * assignment.timesPerMonth;

// CORRECT:
const monthStartDate = monthKey + "-01";
expectedMinutes += getChoreMinutesAtDate(chore, monthStartDate) * 
                   getAssignmentFrequencyAtDate(assignment, monthStartDate);
```

### 3. Dual Chore Systems: Individual vs Community

**Individual Chores:**
- Assigned to specific people via `assignments` collection
- Count toward completion percentages
- Can create debts between people
- Standard fee/credit calculation

**Community Chores:**
- NOT assigned to anyone
- Do NOT count toward individual or house-wide completion percentages
- Tracked separately as "Community Chore Minutes"
- Use tiered credit system (configurable in `feeSettings.communityCreditTiers`)
- Completions have `type: "community"` field

**Filtering completions:**
```typescript
// Individual chores only
const individualCompletions = completions.filter(c => c.type !== "community");

// Community chores only
const communityCompletions = completions.filter(c => c.type === "community");
```

### 4. Debt Management System

**Debt Creation:**
- When Person A does a chore for Person B (cross-person completion), check for existing debts first
- If debts exist where `debtorId === A` and `creditorId === B`, apply completion as payment (oldest-first)
- If no debts exist in that direction, create a new `Debt` record with a `dueDate`

**Debt Expiration:**
- Debts expire when `dueDate < today` AND `remainingMinutes > 0`
- Expired debts trigger retroactive stats adjustment and fee calculations
- Use `checkAndMarkExpiredDebts()` to detect and mark expired debts
- Fee adjustments are allocated to the **expiration month** (not the month after)

### 5. Fees & Credits Calculation

**Base Fee Formula:**
```typescript
if (completionPercentage >= rewardThreshold) {
  baseFee = -rewardAmount;  // Negative = credit
} else {
  baseFee = (100 - completionPercentage) * penaltyModifier;
}
```

**Important:** Base fees MUST use stats excluding expired debts (`calculatePersonStatsWithoutExpiredDebts`)

**Total Fee Calculation:**
```typescript
totalFee = baseFee + expiredDebtFees;
actualTotalFee = totalFee - communityChoreCredit;
```

Community credits always reduce fees (never increase them).

## Component Structure (All in App.tsx)

### Main Components

**App (Main):**
- Global state management (people, chores, assignments, completions, debts, etc.)
- Firebase listeners setup (`useEffect` hooks)
- View routing (calendar, analysis, admin)

**CalendarView:**
- Month navigation
- Day grid with completion indicators
- Individual chores: circular dots (color = person who receives credit)
- Community chores: square badges in teal/cyan
- Provisional credits: dashed borders
- Opens `RecordChoreModal` on day click

**RecordChoreModal:**
- Mode toggle: Individual vs Community (top-right)
- Individual mode: person, chore, partial completion, forPersonId, dueDate (if cross-person)
- "Who was this chore for?" dropdown appears whenever the chore has assignees AND (doer is not an assignee OR there is more than one assignee). When the doer is one of the assignees, forPersonId defaults to the doer so the self-completion case needs no extra click; co-assignees remain selectable so one co-assignee can credit another and issue a debt. Hidden only when the doer is the chore's sole assignee.
- Community mode: person, community chore type, minutes (1-999)
- Handles debt creation/payment logic on save

**AnalysisView:**
- Tabs: Individual, House Total, History, Debts, Fees/Credits
- "Show adjusted stats" toggle (excludes expired debt credits)
- Separate community stats sections in Individual and House Total tabs
- Month selector shared across tabs

**AdminView:**
- Tabs: People, Chores, Assignments, Fee Settings, Community Chores
- Edit modals for chores and assignments (with effective date pickers)
- Fee settings includes community credit tier management
- All deletes are cascading (e.g., deleting person deletes their assignments)

### Key Calculation Functions

**Stats Calculations:**
- `calculatePersonStats(personId, monthFilter)` - includes provisional credits
- `calculatePersonStatsWithoutExpiredDebts(personId, monthFilter)` - excludes expired debts
- `calculatePersonCommunityStats(personId, monthFilter)` - community chore stats
- `calculateHouseCommunityStats(monthFilter)` - house-wide community stats

**Fee Calculations:**
- `calculateBaseFee(completionPercentage, feeSettings)` - base fee from completion %
- `calculateExpiredDebtFee(debt)` - retroactive fee adjustment for expired debt
- `calculateCommunityChoreCredit(personId, monthKey, feeSettings)` - tiered credit
- `calculateMonthlyFees(monthKey)` - orchestrates all fee calculations for a month
- `processExpiredDebts()` - processes all unprocessed expired debts

**Debt Management:**
- `checkAndMarkExpiredDebts(debts, completions, db)` - marks expired debts

## Common Development Patterns

### Adding a New Firestore Collection

1. Add state in `App` component: `const [newCollection, setNewCollection] = useState([])`
2. Add `useEffect` with `onSnapshot` listener
3. Pass state as props to child components
4. Use `setDoc`, `updateDoc`, `deleteDoc` from `firebase/firestore` for writes

### Adding a New Stats Calculation

1. Create function inside `AnalysisView` component (or in global scope if reusable)
2. Filter completions by `monthFilter` if month-specific
3. Use historical helper functions (`getChoreMinutesAtDate`, etc.) for expected minutes
4. For completed minutes, use `completion.minutes` directly (immutable)
5. Handle community vs individual chores separately (filter by `type` field)

### Editing Historical Data (Chores/Assignments)

Pattern for editing with versioning:
```typescript
await updateDoc(doc(db, "chores", choreId), {
  name: newName,
  minutes: newMinutes,
  effectiveDate: effectiveDateString,  // YYYY-MM-DD
  history: [
    ...(existingChore.history || []),
    {
      name: existingChore.name,
      minutes: existingChore.minutes,
      effectiveDate: existingChore.effectiveDate || "1900-01-01"
    }
  ],
  lastChangedAt: new Date().toISOString()
});
```

Effective dates cannot be in the future (validate in UI).

## Data Model Reference

### Firestore Collections

1. **people** - household members (`id`, `name`)
2. **chores** - chore definitions (`id`, `name`, `minutes`, optional: `effectiveDate`, `history`)
3. **assignments** - person-to-chore mappings (`id`, `personId`, `choreId`, `timesPerMonth`, optional: `dayOfWeek`, `effectiveDate`, `history`)
4. **completions** - completed chores (`id`, `date`, `completedBy`, `choreId`, `minutes`, `forPersonId`, optional: `type`, `isProvisional`, `sourceDebtId`, `communityChoreTypeId`)
5. **debts** - chore debts (`id`, `creditorId`, `debtorId`, `choreId`, `originalMinutes`, `remainingMinutes`, `dueDate`, optional: `expiredAt`, `feeCalculated`)
6. **debtPayments** - debt payment records (`id`, `debtId`, `completionId`, `minutesApplied`)
7. **feeSettings** - singleton config (`id: "settings"`, `rewardThreshold`, `rewardAmount`, `penaltyModifier`, `communityCreditTiers`)
8. **monthlyFees** - monthly fee records (`id`, `personId`, `monthKey`, `baseFee`, `expiredDebtFees`, `totalFee`, `communityChoreCredit`, `processed`)
9. **communityChoreTypes** - community chore categories (`id`, `name`)

### Important Field Defaults

- `completion.type` defaults to `"individual"` (backward compatibility)
- `completion.forPersonId` defaults to `null` or equals `completedBy` for self-completions
- Missing `effectiveDate`/`history` on chores/assignments = values effective since beginning
- `dayOfWeek` on assignments: `undefined`/`null` = any day, `0-6` = specific day (Sunday-Saturday)

## Date Formats

- **Date strings**: `"YYYY-MM-DD"` (e.g., `"2024-03-15"`)
- **Month keys**: `"YYYY-MM"` (e.g., `"2024-03"`)
- **ISO timestamps**: `new Date().toISOString()` (e.g., `"2024-03-15T14:30:00.000Z"`)

Use `getMonthKey(date)` utility to convert Date objects to month keys.

## Deployment

**GitHub Pages:**
- Update `base` in `vite.config.js` to match repo name: `base: '/your-repo-name/'`
- Deployment workflow: `.github/workflows/deploy.yml` (already configured)
- Requires Firebase env vars as GitHub Secrets
- Deploys from `main` branch to `gh-pages` branch

## Known Limitations & Gotchas

1. **No type checking**: TypeScript interfaces are documented in README but not enforced at build time
2. **No tests**: All changes must be validated manually
3. **Monolithic file**: App.tsx is 4500+ lines; search carefully before adding duplicate logic
4. **Real-time listeners**: Changes propagate immediately; be careful with `updateDoc` in loops
5. **Community chores are not orphan-safe**: Deleting a community chore type doesn't delete completions (they show as "Unknown")
6. **Provisional credit UI complexity**: Calendar view dashed borders indicate provisional credits, but expired debts retroactively affect historical months' stats
7. **All-time calculations are expensive**: Consider performance when adding new all-time stats

## Naming Conventions

- Collections: lowercase plural (e.g., `people`, `chores`, `completions`)
- Component functions: PascalCase (e.g., `CalendarView`, `RecordChoreModal`)
- Utility functions: camelCase (e.g., `generateId`, `getMonthKey`)
- State variables: camelCase (e.g., `currentMonth`, `showRecordModal`)
- Firestore document IDs: random 9-char alphanumeric via `generateId()`

## When Making Changes

**Before editing calculations:**
1. Understand whether it affects individual chores, community chores, or both
2. Check if historical versioning applies (use helper functions)
3. Verify credit assignment logic (who gets credit: completedBy or forPersonId?)
4. Consider impact on both current and expired debts

**Before editing UI:**
1. Identify which component(s) in App.tsx need changes
2. Check if props need to be passed down from App
3. Community vs individual mode: are both affected?
4. Test with real-time updates (open app in two browser tabs)

**Before editing data model:**
1. All changes MUST be additive (new optional fields only)
2. Update README.md data model documentation
3. Consider backward compatibility (existing data without new fields)
4. Add migration logic if needed (e.g., default values in calculations)
