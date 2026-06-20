# Chore Tracker

A chore tracking application with Firebase backend, designed to help households track and manage chore assignments and completions. This application provides a calendar-based interface for recording chore completions, tracks individual and household performance metrics, models chore debts as first-class records when someone does a chore for someone else, and includes a separate Community Chores system for unassigned chores that anyone can do.

**Key Feature: Credit Assignment System**
- When someone does a chore for another person, the **credit goes to the person the chore was done FOR**, not the person who did it
- Credits are "provisional" until the debt is paid or expires
- Expired debts trigger retroactive stats adjustment

## Original Requirements

The application was built to fulfill the following requirements:

- **Calendar View**: Month-by-month visual calendar (like pages of a calendar)
- **People Management**: Arbitrarily defined number of people, each with a regular allocation of chores
- **Chore Definition**: Each chore has a name and is worth a specific number of minutes
- **Chore Frequency**: Each chore can be done an arbitrary number of times per month
- **Performance Tracking**: Track minutes of chores completed as a percentage of expected allocation
- **Admin Screen**: Set up chores, people, and assignments (who does what, how many times per month)
- **Calendar Screen**: Click on any day to record completed chores
- **Analysis Screen**:
  - Individual performance (total time, percentage of expected, monthly breakdown)
  - House-wide totals and percentages
  - Long-term history per person
  - Debt tracking (who owes whom specific chores and minutes when chores are done for others)

## Features

- **Calendar View**: Visual calendar showing completed chores with color-coded dots for each person
  - Credits are assigned to the person the chore was done FOR (not the doer)
  - Provisional credits are visually indicated with dashed borders
  - **Community Chores**: Displayed with square badges in teal/cyan color (vs circular dots for individual chores)
- **Analysis Dashboard**:
  - Individual performance tracking with monthly breakdowns
  - **Adjusted Stats**: Toggle to view stats excluding expired debt credits
  - House-wide totals and progress
  - Historical data across multiple months (3, 6, or 12 month views)
  - Debt tracking (who owes whom chores, with per-debt detail and progress)
  - Expired debt indicators and expiration status
  - Chore completion status tracking
  - **Fees/Credits Tracking**: Monthly fee and credit calculations based on completion percentages
    - Base fees/credits calculated from monthly completion percentages
    - Expired debt fees calculated retroactively when debts expire
    - Running tally of all fees/credits per person
    - Mark fees as processed after rent calculation
- **Credit Assignment System**:
  - Cross-person completions credit the recipient (not the doer)
  - Provisional credits until debts are paid or expire
  - Automatic retroactive stats adjustment when debts expire
- **Admin Panel**: Manage people, chores, and assignments
  - **Chore Editing**: Edit chore names and minutes with effective dates, preserving historical accuracy
  - **Assignment Editing**: Edit assignment frequencies with effective dates, preserving historical accuracy
  - **Fee Settings**: Configure reward thresholds, reward amounts, and penalty modifiers
  - **Community Chore Types**: Manage types/categories of community chores (e.g., "Yard Work", "Deep Clean")
  - **Community Credit Tiers**: Configure tiered credit system for community chores (fixed credits per minute range)
- **Day-Specific Chores**: Optional day-of-week assignments for recurring weekly chores
- **Fees & Credits System**: Automated calculation of monthly fees and credits
  - Rewards for high completion percentages (default: 90%+ = $20 credit)
  - Penalties for low completion percentages (default: $1 per percentage point below 100%)
  - Retroactive fee adjustments when debts expire
  - Monthly fee tracking for rent calculation
- **Community Chores System**: Separate tracking for unassigned chores that anyone can do
  - Community chores do NOT count toward individual completion percentages
  - Community chores do NOT count toward house-wide completion percentages
  - Tracked separately as "Community Chore Minutes"
  - Tiered credit system based on total minutes completed per month (configurable tiers)
  - Default credit tiers: 0-29 min = $0, 30-59 = $5, 60-89 = $10, 90-119 = $15, 120+ = $20
  - Credits reduce total fees owed (community credit is subtracted from total fee)

## Architecture

### Technology Stack

- **Frontend**: React 18 with Vite
- **Styling**: Tailwind CSS 3.4
- **Backend**: Firebase Firestore (NoSQL database)
- **Deployment**: GitHub Pages
- **Build Tool**: Vite 5

### Application Structure

The application is a single-page application (SPA) with three main views:

1. **Calendar View** (`CalendarView` component)
2. **Analysis View** (`AnalysisView` component)
3. **Admin View** (`AdminView` component)

All data is stored in Firebase Firestore and synchronized in real-time using `onSnapshot` listeners. The application uses a single-file architecture with all components defined in `App.tsx`.

## Data Structure Model

### Firebase Collections

The application uses nine Firestore collections:

#### 1. `people` Collection

Stores household members.

```typescript
interface Person {
  id: string;           // Unique identifier (generated)
  name: string;         // Display name of the person
}
```

**Operations:**

- Create: Add new person via Admin panel
- Read: Real-time listener syncs all people
- Delete: Removes person and all their assignments (cascade delete)

#### 2. `chores` Collection

Stores chore definitions with time values.

```typescript
interface Chore {
  id: string;           // Unique identifier (generated)
  name: string;         // Name of the chore (e.g., "Dishes", "Vacuum")
  minutes: number;      // Time value in minutes for completing this chore
  // Optional versioning fields (added for editing feature):
  effectiveDate?: string;  // YYYY-MM-DD format, when current values became effective
  history?: Array<{
    minutes: number;
    name?: string;  // Store old name if it changed
    effectiveDate: string;  // YYYY-MM-DD, when this version was effective
  }>;
  lastChangedAt?: string;  // ISO timestamp of last edit
}
```

**Operations:**

- Create: Add new chore with name and minutes via Admin panel
- Read: Real-time listener syncs all chores
- Update: Edit chore name and/or minutes with an effective date (preserves history)
- Delete: Removes chore and all related assignments (cascade delete)

**Versioning Behavior:**

- If `effectiveDate` is missing, assume values have been effective since the beginning
- `history` array stores previous versions in chronological order (oldest first)
- When editing, current values are pushed to `history`, then current values are updated
- Historical calculations use values effective on the date being calculated
- Backward compatible: Existing chores without versioning fields continue to work

#### 3. `assignments` Collection

Stores person-to-chore assignments with frequency and optional day specificity.

```typescript
interface Assignment {
  id: string;                    // Unique identifier (generated or reused if updating)
  personId: string;               // Reference to person.id
  choreId: string;               // Reference to chore.id
  timesPerMonth: number;         // How many times per month this person should do this chore
  dayOfWeek?: number | null;     // Optional: 0-6 (Sunday-Saturday) for day-specific chores
  // Optional versioning fields (added for editing feature):
  effectiveDate?: string;  // YYYY-MM-DD format, when current frequency became effective
  history?: Array<{
    timesPerMonth: number;
    effectiveDate: string;  // YYYY-MM-DD, when this version was effective
  }>;
  lastChangedAt?: string;  // ISO timestamp of last edit
}
```

**Key Behaviors:**

- **Regular Assignments**: When `dayOfWeek` is `undefined` or `null`, the chore can be done any day
- **Day-Specific Assignments**: When `dayOfWeek` is set (0-6), the assignment only applies to that day of the week
- **Uniqueness**: For regular chores, only one assignment per person-chore pair. For day-specific, one per person-chore-dayOfWeek combination
- **Update Logic**: If an assignment already exists (matching person, chore, and optionally dayOfWeek), it updates the existing record instead of creating a duplicate

**Operations:**

- Create/Update: Assign chore to person with frequency and optional day
- Read: Real-time listener syncs all assignments
- Update: Edit assignment frequency with an effective date (preserves history)
- Delete: Remove specific assignment

**Versioning Behavior:**

- If `effectiveDate` is missing, assume frequency has been effective since the beginning
- `history` array stores previous frequencies in chronological order
- When editing, current frequency is pushed to `history`, then current frequency is updated
- Historical calculations use frequencies effective on the date being calculated
- Backward compatible: Existing assignments without versioning fields continue to work

#### 4. `completions` Collection

Stores records of completed chores (both individual and community).

```typescript
interface Completion {
  id: string;           // Unique identifier (generated)
  date: string;         // Date in "YYYY-MM-DD" format
  completedBy: string;  // Reference to person.id (who did the chore)
  choreId: string;      // Reference to chore.id (which chore was done) - only for individual completions
  minutes: number;      // Minutes recorded for this completion (full or partial)
  createdAt: string;    // ISO timestamp of when the record was created
  type?: "individual" | "community";  // Defaults to "individual" for backward compatibility
  forPersonId: string | null; // Reference to person.id this chore was done for (only for individual completions)
  isProvisional?: boolean;    // true if this completion created a debt that hasn't been paid/expired (only for individual)
  sourceDebtId?: string;      // If this completion created a debt, reference it (only for individual)
  communityChoreTypeId?: string;  // Reference to communityChoreType.id (only for community completions)
}
```

**Key Behaviors:**

- **Type Field**: `type` field distinguishes individual vs community completions (defaults to "individual" for backward compatibility)
- **Individual Completions** (`type === "individual"` or undefined):
  - **Credit Assignment**: Credits go to `forPersonId` (not `completedBy`) for cross-person completions. This means when Person A does a chore for Person B, Person B gets the credit toward their stats.
  - **Provisional Credits**: When a cross-person completion creates a new debt, the credit is marked as "provisional" until the debt is paid or expires.
  - **Self-Completions**: If `forPersonId === completedBy`, credit goes to `completedBy` (normal behavior).
- **Community Completions** (`type === "community"`):
  - Do NOT count toward individual completion percentages
  - Do NOT count toward house-wide completion percentages
  - Tracked separately as "Community Chore Minutes"
  - `choreId` may be empty/null (or could reference a placeholder)
  - `forPersonId` is always null (no cross-person tracking)
  - `isProvisional` and `sourceDebtId` are always undefined
  - `communityChoreTypeId` must be present

**Operations:**

- Create: Record completion via calendar day click (supports both individual and community modes)
- Read: Real-time listener syncs all completions
- Update: `isProvisional` is set to `false` when the associated debt is fully paid (individual only)
- Delete: Not currently implemented in UI (would require manual Firestore deletion)

#### 5. `debts` Collection

Stores chore debts as explicit obligations between two people, created when someone does a chore for someone else and there is no existing debt in that direction.

```typescript
interface Debt {
  id: string;               // Unique identifier (generated)
  creditorId: string;       // Person who is owed time (did the original favor)
  debtorId: string;         // Person who owes time back
  choreId: string;          // Chore that created this debt
  originalMinutes: number;  // Total minutes of the original favor
  remainingMinutes: number; // Minutes still owed on this debt
  createdAt: string;        // ISO timestamp when the debt was created
  dueDate: string | null;   // Due date (YYYY-MM-DD) for paying back the favor
  sourceCompletionId: string; // ID of completion that created this debt
  expiredAt?: string;       // ISO timestamp when debt expired (set when dueDate passes and not fully paid)
  feeCalculated: boolean;   // true if fees have been calculated for this expired debt (for future use)
}
```

**Key Behaviors:**

- **Expiration**: A debt expires when `dueDate < today` AND `remainingMinutes > 0`. The system automatically detects and marks expired debts.
- **Payment**: When a debt is fully paid (`remainingMinutes <= 0`), the source completion's `isProvisional` is set to `false`, making the credit permanent.

**Operations:**

- Create: When a cross-person completion is recorded and there are no existing debts from debtor to creditor
- Read: Real-time listener syncs all debts
- Update: 
  - `remainingMinutes` is reduced automatically as payments are applied
  - `expiredAt` is set automatically when debt expires
  - `feeCalculated` is set when fees are calculated (for future Task 2)

#### 6. `debtPayments` Collection

Stores how individual chore completions pay down existing debts.

```typescript
interface DebtPayment {
  id: string;            // Unique identifier (generated)
  debtId: string;        // Reference to debt.id
  completionId: string;  // Reference to completion.id used as payment
  minutesApplied: number; // Minutes from this completion applied to the debt
  createdAt: string;     // ISO timestamp when payment was recorded
}
```

**Operations:**

- Create: When a cross-person completion is recorded and there are existing debts from debtor to creditor
- Read: (Optional) for audit/history views or debugging

#### 7. `feeSettings` Collection (Singleton)

Stores global fee and credit configuration settings for both individual and community chores.

```typescript
interface FeeSettings {
  id: "settings";           // Always this ID (singleton)
  rewardThreshold: number;  // Completion % to get reward (default: 90)
  rewardAmount: number;     // Dollar amount of reward (default: 20)
  penaltyModifier: number;  // Multiplier for penalty calculation (default: 1.0)
  communityCreditTiers: Array<{ min: number; credit: number }>;  // Tiered credit system for community chores
  lastUpdated: string;      // ISO timestamp
}
```

**Community Credit Tiers:**

Default tier structure:
```typescript
[
  { min: 0, credit: 0 },
  { min: 30, credit: 5 },
  { min: 60, credit: 10 },
  { min: 90, credit: 15 },
  { min: 120, credit: 20 }
]
```

Tiers are sorted by `min` in ascending order. Credits are calculated by finding the highest tier the person qualifies for based on their total community minutes in the month.

**Operations:**

- Read: Load once on app start, real-time listener syncs changes
- Update: Admin can modify in Admin panel (Fee Settings tab)
- Initialize: If no document exists, defaults are used (90% threshold, $20 reward, 1.0 modifier, default community tiers)
- Migration: If `communityCreditTiers` is missing from existing settings, it's automatically initialized with defaults

#### 8. `monthlyFees` Collection

Tracks fees and credits per person per month for rent calculation.

```typescript
interface MonthlyFee {
  id: string;                // Unique identifier (generated)
  personId: string;          // Reference to person.id
  monthKey: string;          // "YYYY-MM" format
  baseFee: number;           // Fee from completion % (can be negative for credits)
  expiredDebtFees: number;   // Additional fees from expired debts
  totalFee: number;          // baseFee + expiredDebtFees (for convenience, before community credit)
  communityChoreCredit: number; // Credit from community chores (always positive or 0)
  calculatedAt: string;      // ISO timestamp when this was calculated
  processed: boolean;        // true when rent has been calculated and this can be hidden
}
```

**Key Behaviors:**

- **Base Fee**: Calculated from monthly completion percentage using fee formula
- **Expired Debt Fees**: Accumulated retroactive fees when debts expire
- **Community Chore Credit**: Calculated from tiered credit system based on total community minutes
- **Actual Total**: The actual total fee owed is `totalFee - communityChoreCredit` (community credits reduce fees)
- **Processing Status**: `processed: true` marks fees as applied to rent (for treasurer workflow)
- **Historical Preservation**: All records are kept for running tallies, never deleted

**Operations:**

- Create: When calculating fees for a month (via "Recalculate" button or auto-processing)
- Read: Real-time listener syncs all monthly fees
- Update: 
  - Recalculated when "Recalculate" button is clicked
  - `processed` flag updated when treasurer marks as processed
  - `expiredDebtFees` updated when debts expire
  - `communityChoreCredit` calculated and updated when fees are recalculated
- Never delete: Keep all records for historical running tally

#### 9. `communityChoreTypes` Collection

Stores the types/categories of community chores that can be done.

```typescript
interface CommunityChoreType {
  id: string;           // Unique identifier (generated)
  name: string;         // Name of the community chore type (e.g., "Yard Work", "Deep Clean", "Organizing")
  createdAt: string;    // ISO timestamp
}
```

**Key Behaviors:**

- Unlike regular chores, community chore types don't have a fixed `minutes` value
- Minutes are entered directly when recording the completion
- Deleting a community chore type does NOT delete completions (they become "orphaned" and show as "Unknown")

**Operations:**

- Create: Add new community chore type via Admin panel (Community Chores tab)
- Read: Real-time listener syncs all community chore types
- Delete: Removes community chore type (does NOT delete completions, but they become orphaned)

### Data Relationships

```text
Person (1) ──< (many) Assignment (many) >── (1) Chore
Person (1) ──< (many) Completion (many) >── (1) Chore (individual completions)
Person (1) ──< (many) Completion (many) >── (1) CommunityChoreType (community completions)
```

- One person can have many assignments
- One chore can be assigned to many people
- One person can complete many chores (individual)
- One chore can be completed many times (individual)
- One person can complete many community chores
- One community chore type can be completed many times
- Community completions are independent of assignments and don't create debts

## Business Logic & Calculations

### Expected Minutes Calculation

For a given person and time period:

**Month-Specific Calculations:**
```typescript
expectedMinutes = sum(
  for each assignment where personId === person.id:
    getChoreMinutesAtDate(chore, monthStartDate) * 
    getAssignmentFrequencyAtDate(assignment, monthStartDate) * 1
)
```

**All-Time Calculations:**
```typescript
// For each month with completions:
expectedMinutes = sum(
  for each month in monthsWithCompletions:
    for each assignment where personId === person.id:
      getChoreMinutesAtDate(chore, monthStartDate) * 
      getAssignmentFrequencyAtDate(assignment, monthStartDate) * 1
)
```

**Historical Value Lookup:**
- `getChoreMinutesAtDate(chore, date)`: Returns the chore minutes that were effective on a given date
- `getAssignmentFrequencyAtDate(assignment, date)`: Returns the assignment frequency that was effective on a given date
- These functions handle versioning by checking `effectiveDate` and `history` arrays
- If no versioning exists, returns current values (backward compatible)

**Key Principle:** Expected minutes use the values (chore minutes and assignment frequency) that were effective during the time period being calculated, ensuring historical accuracy.

### Completed Minutes Calculation

For a given person and time period:

```typescript
completedMinutes = sum(
  for each completion where:
    // Self-completion: credit goes to completedBy
    (completion.forPersonId === completion.completedBy || !completion.forPersonId) 
      && completion.completedBy === person.id
    OR
    // Cross-person completion: credit goes to forPersonId
    completion.forPersonId === person.id:
    completion.minutes
)
```

**Key Change:** Credits are assigned based on `forPersonId`, not `completedBy`. This means when Person A does a chore for Person B, Person B gets the credit toward their completion stats.

**Important:** Completed minutes come from the `completion.minutes` field stored at the time of recording. These values are **immutable** and do not change when chores are edited. Only expected minutes calculations use historical values.

Filtered by date range if calculating for a specific month.

### Chore Name Display

Chore names displayed in the UI use historical values when showing past completions:

- **Calendar View**: Completion dots show the chore name that was effective when the completion was recorded (`getChoreNameAtDate(chore, completion.date)`)
- **Analysis View**: Chore breakdowns group by the name that was effective at completion time
- **Debts View**: Debts show the chore name that was effective when the debt was created

This ensures that if a chore is renamed, historical completions still show the correct name from that time period.

### Percentage Calculation

```typescript
percentage = expectedMinutes > 0 
  ? Math.round((completedMinutes / expectedMinutes) * 100)
  : 0
```

### Credit Assignment & Provisional Credits

**Core Principle:** Credits go to the person the chore was done FOR (`forPersonId`), not the person who did it (`completedBy`). This ensures that when someone does a favor for another person, the credit counts toward the recipient's obligations.

1. **Self-Completions** (`forPersonId === completedBy`):
   - Credit goes to `completedBy`
   - No debt is created
   - Credit is permanent (not provisional)

2. **Cross-Person Completions** (`forPersonId !== completedBy`):
   - Credit goes to `forPersonId` (the person the chore was done for)
   - Credit is **provisional** until the debt is paid or expires
   - Completion is marked with `isProvisional: true` and `sourceDebtId` when a new debt is created

### Debt Calculation

Debts are tracked as explicit `Debt` documents and are based on **who a chore was done for**, not inferred automatically from assignments.

1. **Recording a cross-person completion**:
   - When recording a completion, the user selects both:
     - **Who did the chore** (`completedBy`)
     - **Who it was done for** (`forPersonId`)
   - If `forPersonId` is empty or equals `completedBy`, no debt logic is applied.
   - If `forPersonId !== completedBy`, this is treated as a favor from `completedBy` (creditor) to `forPersonId` (debtor).
   - **Credit Assignment**: The completion counts toward `forPersonId`'s stats (not `completedBy`'s).

2. **Finding existing debts (oldest-first auto payment)**:
   - For a cross-person completion where `completedBy = X` and `forPersonId = Y`, the system looks for open debts where:
     - `debtorId === X` and `creditorId === Y`
     - `remainingMinutes > 0`
   - If such debts exist, the completion's minutes are split into a **payment portion** (capped at the sum of `remainingMinutes` across those open debts) and a **leftover portion** (any minutes beyond that). The payment portion is applied oldest-first:
     - For each application:
       - A `DebtPayment` record is created.
       - The corresponding `Debt.remainingMinutes` is reduced.
     - When a debt is fully paid (`remainingMinutes <= 0`), the source completion's `isProvisional` is set to `false`.

3. **Creating new debts**:
   - A new `Debt` document is created whenever a cross-person completion includes a leftover portion. There are two cases:
     - **Pure new debt**: no open debts from `X` to `Y` exist, so the entire `completion.minutes` becomes the new debt.
     - **Mixed payment + new debt**: existing debts cover only part of the new completion (e.g. X owes Y 20 min and X does a 45-min chore for Y) — the 20 are applied as a payment and the leftover 25 become a new debt with polarity flipped.
   - The new `Debt` has:
     - `creditorId = completedBy`
     - `debtorId = forPersonId`
     - `originalMinutes = remainingMinutes = leftover minutes`
     - `dueDate` is manually selected in the UI when saving the completion.
   - **Split completion records (mixed case only)**: in the mixed case, the save writes **two** completion records — one non-provisional record for the payment portion (used as `DebtPayment.completionId`) and one provisional record for the leftover portion with `isProvisional: true` and `sourceDebtId` pointing to the new debt. This ensures the stats-exclusion logic for an expired leftover debt only retracts the leftover credit, never the payment portion that already cleared an old debt.

4. **Debt expiration**:
   - A debt expires when `dueDate < today` AND `remainingMinutes > 0`.
   - When a debt expires:
     - `expiredAt` is set to the current timestamp
     - The provisional credit from the source completion is removed from stats calculations (retroactive adjustment)
     - Expired debts are visually distinguished in the UI (strikethrough, grayed out)

5. **Debt status**:
   - In the UI, debts are labeled based on:
     - `remainingMinutes <= 0` → **Paid**
     - `remainingMinutes > 0` and `expiredAt` is set → **Expired**
     - `remainingMinutes > 0` and `dueDate` in the past → **Overdue**
     - Otherwise → **Open**

### Retroactive Stats Adjustment

When a debt expires, the system retroactively adjusts the stats for the month in which the debt was created:

1. **Calculate adjusted stats**: Stats are recalculated excluding the expired debt's provisional credit
2. **Display options**: Users can toggle between "current stats" (with provisional credits) and "adjusted stats" (without expired debt credits) in the Analysis view
3. **Visual indicators**: Provisional credits are marked in the calendar view, and expired debts are clearly indicated in the debt display

This ensures that expired debts don't permanently inflate completion percentages, while still maintaining a clear audit trail of what happened.

### Fees & Credits System

The application includes an automated fee and credit tracking system that calculates monthly fees/credits based on completion percentages and handles retroactive adjustments when debts expire.

#### Fee Settings Configuration

Fee settings are stored as a singleton document in the `feeSettings` collection and can be configured in the Admin panel:

- **Reward Threshold**: Completion percentage required to earn a reward (default: 90%)
- **Reward Amount**: Dollar amount of credit for meeting threshold (default: $20)
- **Penalty Modifier**: Multiplier for penalty calculation (default: 1.0)

#### Base Fee Calculation

Base fees are calculated monthly for each person based on their completion percentage:

```typescript
if (completionPercentage >= rewardThreshold) {
  baseFee = -rewardAmount; // Negative = credit
} else {
  baseFee = (100 - completionPercentage) * penaltyModifier;
}
```

**Examples:**
- 95% completion, threshold 90%, reward $20: `-$20` (credit)
- 80% completion, modifier 1.0: `(100 - 80) * 1.0 = $20` (fee)
- 80% completion, modifier 1.5: `(100 - 80) * 1.5 = $30` (fee)
- 50% completion, modifier 1.0: `(100 - 50) * 1.0 = $50` (fee)

**Important:** Base fees are calculated using stats that **exclude expired debt credits** (`calculatePersonStatsWithoutExpiredDebts`). This ensures consistency with the "Individual" tab's adjusted stats display.

#### Expired Debt Fee Calculation

When a debt expires (not fully paid by its due date), the system calculates a retroactive fee adjustment:

1. **Identify Expired Debt**: Debt must have `expiredAt` set, `remainingMinutes > 0`, and `feeCalculated: false`
2. **Find Original Completion**: Locate the completion that created the debt (`sourceCompletionId`)
3. **Get Completion Month**: Extract month key from completion date
4. **Calculate Stats Without Debt**: Calculate what the debtor's stats would have been in the original month WITHOUT this debt's credit (excluding all debts that expired BEFORE this one)
5. **Calculate Stats With Debt**: Calculate what the debtor's stats were WITH this debt's credit (excluding debts that expired before this one)
6. **Calculate Fee Delta**: 
   - `feeWithout = calculateBaseFee(statsWithout.percentage)`
   - `feeWith = calculateBaseFee(statsWith.percentage)`
   - `delta = feeWithout - feeWith`
7. **Allocate to Target Month**: Add delta to the **expiration month's** `expiredDebtFees` (not the month after)
8. **Mark as Calculated**: Set debt's `feeCalculated: true` to prevent double-calculation

**Key Principle:** Each debt expiration is handled independently. When calculating retroactive stats for a debt, we exclude:
- This debt's credit (since it expired)
- All other debts that expired BEFORE this one (since their credits were already removed)
- But we include debts that haven't expired yet (or expired after this one)

**Example:**
- Nov 15: Person A does chore for Person B (100 min)
- Person B's Nov stats: 85% completion (with credit)
- Person B's Nov stats without this credit: 75% completion
- Fee with credit: `(100 - 85) * 1.0 = $15`
- Fee without credit: `(100 - 75) * 1.0 = $25`
- Delta: `$25 - $15 = $10`
- Dec 10: Debt expires (not fully paid)
- Person B's Dec `expiredDebtFees`: `+$10`
- Person B's Nov stats retroactively adjusted to 75% (for display purposes)

**Timing:** Expired debt fees are allocated to the **expiration month** (not the month after). This ensures all December fees (base + expired debt) contribute to January's rent calculation, maintaining consistency with the rent calculation timeline.

#### Monthly Fee Processing Workflow

1. **Automatic Processing**: When viewing the "Fees/Credits" tab, the system automatically processes any unprocessed expired debts
2. **Manual Calculation**: Click "Recalculate" button to:
   - Process any unprocessed expired debts
   - Recalculate base fees for all people for the selected month
   - Update or create `monthlyFees` records
   - Preserve `processed` status on existing records
3. **Processing Status**: After rent is calculated, treasurer can mark fees as "Processed" using the "Mark Processed" button
4. **Running Tally**: The system maintains a running total of all fees/credits per person across all months

#### Community Chore Credit Calculation

Community chores use a tiered credit system based on total minutes completed in the month. There are no expectations or goals for community minutes - credits are purely reward-based.

**Credit Calculation:**

```typescript
function calculateCommunityChoreCredit(personId, monthKey, feeSettings) {
  const stats = calculatePersonCommunityStats(personId, monthKey);
  const totalMinutes = stats.totalMinutes;
  
  // Find the highest tier the person qualifies for
  const tiers = feeSettings.communityCreditTiers || defaultTiers;
  let credit = 0;
  for (let i = tiers.length - 1; i >= 0; i--) {
    if (totalMinutes >= tiers[i].min) {
      credit = tiers[i].credit;
      break;
    }
  }
  
  return credit;
}
```

**Default Tiers:**
- 0-29 minutes: $0 credit
- 30-59 minutes: $5 credit
- 60-89 minutes: $10 credit
- 90-119 minutes: $15 credit
- 120+ minutes: $20 credit

Tiers are configurable in the Admin panel (Fee Settings tab).

#### Total Fee Calculation

For each person per month:

```typescript
totalFee = baseFee + expiredDebtFees
actualTotalFee = totalFee - communityChoreCredit
```

Where:
- `baseFee`: Calculated from completion percentage (excluding expired debt credits)
- `expiredDebtFees`: Sum of all retroactive fee adjustments from debts that expired in this month
- `communityChoreCredit`: Credit from community chores (always positive or 0, reduces total fee)

**Note:** Credits are negative values, fees are positive. Example: `-$20 (credit) + $10 (expired debt) - $5 (community credit) = -$15` (net credit).

#### UI Components

**Fees/Credits Tab (Analysis View):**
- Month selector (same as other tabs)
- Table showing per-person fees for selected month:
  - Person name
  - Completion percentage (excluding expired debt credits)
  - Base fee/credit
  - Expired debt fees
  - Community Chore Credit (new column)
  - Total fee/credit (after subtracting community credit)
  - Status (Pending/Processed)
- "Recalculate" button: Recalculates all fees for the selected month (including community credits)
- "Mark Processed" button: Marks individual fees as processed (after rent calculation)
- Running Tally section: Shows total fees/credits per person across all months

**Fee Settings Tab (Admin View):**
- Reward threshold input
- Reward amount input
- Penalty modifier input
- Example calculation display
- Save button to update settings

### Month Key Format

Months are identified using the format `"YYYY-MM"` (e.g., `"2024-03"`). This is used for:
- Filtering completions by month
- Grouping data in history views
- Date comparisons

## User Flows

### 1. Initial Setup (Admin View)

1. Navigate to Admin panel
2. **Add People**: Enter names to create household members
3. **Add Chores**: Create chore definitions with names and minute values
4. **Create Assignments**: 
   - Select person, chore, and frequency (times per month)
   - Optionally mark as "day-specific" and select a day of week
   - System prevents duplicate assignments

### 1a. Editing Chores and Assignments (Admin View)

**Editing a Chore:**
1. Navigate to Admin panel → Chores tab
2. Click the "Edit" button (pencil icon) next to the chore you want to edit
3. Modal opens with:
   - Current chore name (editable)
   - Current minutes (editable)
   - Effective date picker (defaults to today, cannot be in the future)
4. Make your changes and select when they became effective
5. Click "Save Changes"
6. System automatically:
   - Saves current values to history
   - Updates current values
   - Sets effective date
   - Updates `lastChangedAt` timestamp

**Editing an Assignment:**
1. Navigate to Admin panel → Assignments tab
2. Click the "Edit" button (pencil icon) next to the assignment you want to edit
3. Modal opens with:
   - Person and chore (read-only, shown for reference)
   - Current frequency (editable)
   - Effective date picker (defaults to today, cannot be in the future)
4. Make your changes and select when they became effective
5. Click "Save Changes"
6. System automatically:
   - Saves current frequency to history
   - Updates current frequency
   - Sets effective date
   - Updates `lastChangedAt` timestamp

**Important Notes:**
- Effective dates cannot be in the future
- Historical completions are **not** changed - they preserve the minutes that were actually completed
- Expected minutes calculations will use the values effective during each time period
- If you edit a chore from 5 to 10 minutes with effective date Jan 1st, a completion recorded on Jan 5th will still show 5 minutes (what was actually done), but expected minutes for January will use 10 minutes

### 2. Recording Completions (Calendar View)

1. Navigate to Calendar view
2. Click on any day in the calendar
3. Modal opens showing:
   - Selected date (formatted as "Weekday, Month Day, Year")
   - **Mode Toggle**: Switch between "Individual" and "Community" modes (top-right of modal)
   
   **Individual Mode (Default):**
   - Dropdown to select who did the chore
   - Dropdown to select which chore was done
   - Checkbox and selector for partial completions (optional)
   - Dropdown to select **who the chore was done for** — appears whenever the
     chore has assignees and either (a) the doer is not one of them, or (b)
     there are multiple assignees (so a co-assignee can credit another
     co-assignee and issue a debt). When the doer is one of the assignees, the
     dropdown defaults to the doer themselves so the "did it for myself" case
     needs no extra click. When the doer is not an assignee, the dropdown is
     blank and a pick is required. The dropdown is hidden only when the doer is
     the sole assignee, since there is no one else to credit.
   - If the chore is done for someone else and will create a new debt, a **due date** field is required
   - Note indicating who will receive credit (the person the chore was done for)
   
   **Community Mode:**
   - Dropdown to select who did the chore
   - Dropdown to select community chore type (e.g., "Yard Work", "Deep Clean")
   - Number input for minutes (1-999)
   - No debt-related fields (community chores don't create debts)
   
4. Click "Save" to record the completion
5. Calendar updates in real-time showing completions:
   - **Individual chores**: Circular dots colored based on who gets credit (`forPersonId`), not who did it
   - **Community chores**: Square badges in teal/cyan color
   - Provisional credits (individual only) are indicated with a dashed border
   - Tooltips show completion details including provisional status (individual) or community type and minutes (community)

### 3. Viewing Analysis (Analysis View)

1. Navigate to Analysis view
2. Select month using navigation arrows
3. Choose tab:
   - **Individual**: See each person's stats for current month and all-time
     - Toggle "Show adjusted stats" to exclude expired debt credits
     - See both current stats (with provisional credits) and adjusted stats (without expired debts)
     - **Community Chores Section**: Shows each person's community chore contributions
       - Total minutes, this month, all-time
       - Breakdown by community chore type
   - **House Total**: Aggregate statistics and chore completion status
     - **Community Chores Section**: Shows house-wide community stats
       - Total minutes, this month, contributors count
       - Top contributors list
   - **History**: Multi-month table showing trends (3, 6, or 12 months)
     - **Individual History Table**: Shows individual chore completion percentages per person per month
     - **Community History Table**: Shows community chore minutes per person per month (new)
   - **Debts**: Per-person view of debts owed and owed-to, with per-debt details:
     - Shows expiration status (expired debts are visually distinguished)
     - Displays which completion created each debt
     - Shows expiration dates for expired debts
   - **Fees/Credits**: Monthly fee and credit tracking
     - View fees/credits for selected month
     - See base fees, expired debt fees, **community chore credits**, and totals per person
     - Total calculation: `baseFee + expiredDebtFees - communityChoreCredit`
     - Click "Recalculate" to process expired debts and recalculate fees (including community credits)
     - Mark fees as "Processed" after rent calculation
     - View running tally of all fees/credits per person

## Component Architecture

### Main App Component

- Manages global state (people, chores, assignments, completions)
- Sets up Firebase real-time listeners
- Handles view navigation
- Renders header with navigation tabs

### CalendarView Component

**Props:**
- `currentMonth`: Date object for displayed month
- `setCurrentMonth`: Function to change month
- `completions`: Array of all completions
- `people`: Array of all people
- `chores`: Array of all chores
- `selectedDate`: Currently selected date string
- `setSelectedDate`: Function to set selected date
- `showRecordModal`: Boolean for modal visibility
- `setShowRecordModal`: Function to toggle modal
- `assignments`: Array of all assignments
- `communityChoreTypes`: Array of all community chore types
- `db`: Firestore database instance

**Features:**
- Month navigation (previous/next)
- Color-coded legend for people
- Calendar grid with day cells
- Click handler to open record modal
- Visual indicators for today
- **Individual Completions**: Circular dots with chore names (truncated if >10 chars)
  - **Credit Assignment**: Dots are colored based on who gets credit (`forPersonId`), not who did the chore
  - **Provisional Indicators**: Provisional credits show with a dashed border
  - **Tooltips**: Show completion details including who did it and provisional status
- **Community Completions**: Square badges in teal/cyan color (`bg-cyan-500`)
  - **Tooltips**: Show "Community: [Type] - [Minutes] min (by [Person])"

### RecordChoreModal Component

**Props:**
- `date`: Date string in "YYYY-MM-DD" format
- `people`: Array of all people
- `chores`: Array of all chores
- `assignments`: Array of all assignments (not currently used in modal)
- `debts`: Array of all debts (used to determine whether a cross-person completion is a new debt or a payment)
- `communityChoreTypes`: Array of all community chore types
- `onClose`: Function to close modal
- `db`: Firestore database instance

**Features:**
- **Mode Toggle**: Switch between "Individual" and "Community" modes (top-right toggle)
- **Individual Mode**:
  - Form to select:
    - Who did the chore
    - Which chore was done
    - Whether it was a partial completion and how many minutes
    - **Who the chore was done for**
  - Saves completion record to Firestore with `type: "individual"` and `forPersonId`
  - Automatically:
    - Creates a new `Debt` (with manual due date) when a favor is done for someone and no existing debts exist in that direction
    - Applies payments oldest-first to existing debts when the debtor does a chore for the creditor
- **Community Mode**:
  - Form to select:
    - Who did the chore
    - Community chore type (dropdown)
    - Minutes (number input, 1-999)
  - Saves completion record to Firestore with `type: "community"` and `communityChoreTypeId`
  - No debt logic (community chores don't create debts)
- Formatted date display

### AnalysisView Component

**Props:**
- `people`: Array of all people
- `chores`: Array of all chores
- `assignments`: Array of all assignments
- `completions`: Array of all completions
- `currentMonth`: Date object for analysis month
- `setCurrentMonth`: Function to change month
- `debts`: Array of all debts

**Features:**
- Tab navigation (Individual, House Total, History, Debts, Fees/Credits)
- Month navigation
- Progress rings for visual percentage display
- History table with configurable time range (3/6/12 months)
- Debt calculation and display
- Chore breakdown per person
- **Adjusted Stats Toggle**: View stats with or without expired debt credits
- **Expired Debt Indicators**: Visual distinction for expired debts in the "Who Owes Who" tab
- **Fees/Credits Tab**: Monthly fee tracking with base fees, expired debt fees, community chore credits, and running tallies
- **Community Stats**: Separate tracking and display of community chore contributions

**Key Functions:**
- `calculatePersonStats(personId, monthFilter)`: Calculates expected, completed, percentage, and breakdown (individual chores only)
- `calculatePersonStatsWithoutExpiredDebts(personId, monthFilter)`: Calculates stats excluding expired debt credits (individual chores only)
- `calculatePersonCommunityStats(personId, monthFilter)`: Calculates community chore stats (total minutes, breakdown by type)
- `calculateHouseCommunityStats(monthFilter)`: Calculates house-wide community stats (total minutes, contributors, top contributors)
- `calculateCommunityChoreCredit(personId, monthKey, feeSettings)`: Calculates community credit based on tiered system
- `calculateBaseFee(completionPercentage, feeSettings)`: Calculates base fee/credit from completion percentage
- `calculateExpiredDebtFee(debt)`: Calculates retroactive fee adjustment for an expired debt
- `calculateMonthlyFees(monthKey)`: Calculates and stores monthly fees for all people for a given month (including community credits)
- `processExpiredDebts()`: Processes all unprocessed expired debts and calculates their fees
- `houseStats()`: Aggregates all people's stats for current month (individual chores only)
- `getLastNMonths(n)`: Generates array of month objects for history view

### AdminView Component

**Props:**
- `people`: Array of all people
- `chores`: Array of all chores
- `assignments`: Array of all assignments
- `db`: Firestore database instance

**Features:**
- Tab navigation (People, Chores, Assignments, Fee Settings, Community Chores)
- CRUD operations for people
- CRUD operations for chores
  - **Edit Chores**: Edit name and/or minutes with effective dates
  - Edit modal validates effective date (cannot be in future)
  - Automatically preserves history when editing
- CRUD operations for assignments
  - **Edit Assignments**: Edit frequency with effective dates
  - Edit modal validates effective date (cannot be in future)
  - Automatically preserves history when editing
- Day-specific assignment option
- Cascade delete (deleting person/chore also deletes assignments)
- **Fee Settings**: Configure reward threshold, reward amount, penalty modifier, and community credit tiers
  - Community credit tiers: Add/edit/delete tiers (min minutes, credit amount)
  - Tiers must be sorted by `min` in ascending order
  - At least one tier must exist
- **Community Chores**: Manage community chore types
  - Add new community chore types (name only, no minutes)
  - Delete community chore types (completions become orphaned but remain)

### ProgressRing Component

**Props:**
- `percentage`: Number (0-100)
- `size`: Number (default 64)
- `strokeWidth`: Number (default 4)

**Features:**
- SVG circular progress indicator
- Color coding based on percentage:
  - 100%+: Green (#81b29a)
  - 75-99%: Yellow (#f2cc8f)
  - 50-74%: Orange (#e07a5f)
  - <50%: Red (#ef4444)

## Utility Functions

### `generateId()`

Generates a random 9-character alphanumeric ID using `Math.random()`.

### `getMonthKey(date)`

Converts a Date object to "YYYY-MM" format string.

### `getDaysInMonth(year, month)`

Returns the number of days in a given month (0-indexed).

### `getFirstDayOfMonth(year, month)`

Returns the day of week (0-6, Sunday-Saturday) for the first day of a month.

### Historical Value Helper Functions

These functions are used to retrieve values that were effective on a specific date, supporting the chore and assignment editing feature. All functions are located in `utils/historical.ts`.

#### `getChoreMinutesAtDate(chore, date: string): number`

Returns the chore minutes that were effective on a given date.

**Logic:**
1. If no versioning exists (`effectiveDate` and `history` are missing), returns current `chore.minutes` (backward compatible)
2. Combines current values and history into a single sorted list (newest to oldest)
3. Searches for the first version where target date >= effectiveDate
4. If no match found (target date is before all effectiveDates), returns the **oldest** value
5. Null effectiveDate means "since beginning of time" and always matches

**Usage:** Used in all expected minutes calculations to ensure historical accuracy.

**Important:** When editing chores, set effectiveDate to the 1st of the month (e.g., "2026-01-01") to avoid gaps. Setting it to mid-month (e.g., "2026-01-15") means dates 1-14 will fall back to the oldest historical value, which may not be what you intend.

#### `getChoreNameAtDate(chore, date: string): string`

Returns the chore name that was effective on a given date.

**Logic:** Similar to `getChoreMinutesAtDate`, but returns the name from the appropriate version. Only history entries that changed the name are included in the search.

**Usage:** Used in calendar view tooltips, analysis view breakdowns, and debts view to show the correct historical name.

#### `getAssignmentFrequencyAtDate(assignment, date: string): number`

Returns the assignment frequency that was effective on a given date.

**Logic:** Similar to `getChoreMinutesAtDate`, but searches for `timesPerMonth` values. Uses the same fallback logic - if target date is before all effectiveDates, returns the oldest frequency.

**Usage:** Used in all expected minutes calculations to ensure historical accuracy.

#### Testing

The historical versioning system includes comprehensive test coverage:
- **Unit tests** (`utils/historical.test.ts`): Test individual lookup functions with various date scenarios
- **Integration tests** (`integration.test.ts`): Test end-to-end scenarios with multiple edits across months
- Run tests with: `npm test`

All tests use Jest and are configured to run with ts-jest for TypeScript support.

## Setup

### Prerequisites

- Node.js (v18 or higher recommended)
- npm or yarn
- Firebase project with Firestore enabled

### Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd chore-tracker
```

2. Install dependencies:
```bash
npm install
```

3. Firebase Configuration:
   - Create a Firebase project at https://console.firebase.google.com
   - Enable Firestore Database
   - Get your Firebase configuration values
   - Create a `.env` file in the root directory:

   ```bash
   VITE_FIREBASE_API_KEY=your-api-key
   VITE_FIREBASE_AUTH_DOMAIN=your-auth-domain
   VITE_FIREBASE_PROJECT_ID=your-project-id
   VITE_FIREBASE_STORAGE_BUCKET=your-storage-bucket
   VITE_FIREBASE_MESSAGING_SENDER_ID=your-messaging-sender-id
   VITE_FIREBASE_APP_ID=your-app-id
   ```
   - Firestore collections will be created automatically on first use
   - Configure Firestore security rules as needed (default rules allow all reads/writes)

4. Start the development server:

```bash
npm run dev
```

The app will be available at `http://localhost:5173`

## Building for Production

To build for GitHub Pages:

1. Update the `base` path in `vite.config.js` to match your GitHub repository name:

```js
base: '/your-repo-name/',
```

2. Build the project:

```bash
npm run build
```

3. The `dist` folder will contain the production-ready files.

## Deploying to GitHub Pages


1. Build the project (see above)

2. Push the `dist` folder contents to the `gh-pages` branch, or use a GitHub Action:

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [ main ]

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm install
      
      - name: Build
        run: npm run build
        env:
          VITE_FIREBASE_API_KEY: ${{ secrets.VITE_FIREBASE_API_KEY }}
          VITE_FIREBASE_AUTH_DOMAIN: ${{ secrets.VITE_FIREBASE_AUTH_DOMAIN }}
          VITE_FIREBASE_PROJECT_ID: ${{ secrets.VITE_FIREBASE_PROJECT_ID }}
          VITE_FIREBASE_STORAGE_BUCKET: ${{ secrets.VITE_FIREBASE_STORAGE_BUCKET }}
          VITE_FIREBASE_MESSAGING_SENDER_ID: ${{ secrets.VITE_FIREBASE_MESSAGING_SENDER_ID }}
          VITE_FIREBASE_APP_ID: ${{ secrets.VITE_FIREBASE_APP_ID }}
      
      - name: Deploy to GitHub Pages
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./dist
```

3. Add Firebase environment variables as GitHub Secrets
4. Enable GitHub Pages in your repository settings to use the `gh-pages` branch

## Project Structure

```
chore-tracker/
├── App.tsx              # Main application component (all components in single file)
├── index.html           # HTML entry point
├── src/
│   ├── main.jsx         # React entry point
│   └── index.css        # Tailwind CSS imports
├── package.json         # Dependencies and scripts
├── vite.config.js       # Vite configuration (includes base path for GitHub Pages)
├── tailwind.config.js   # Tailwind CSS configuration
├── postcss.config.js    # PostCSS configuration
└── .env                 # Firebase configuration (not in git)
```

## Key Implementation Details

### Real-Time Data Synchronization

All data is synchronized in real-time using Firebase `onSnapshot` listeners. When any user makes a change, all connected clients see the update immediately without page refresh.

### Date Handling

- Dates are stored as strings in "YYYY-MM-DD" format for consistency
- Month keys use "YYYY-MM" format for filtering
- JavaScript Date objects are used for calculations and display formatting

### Color Assignment

People are assigned colors from a predefined palette based on their index in the people array. Colors cycle if there are more people than colors.

### Day-Specific Chore Logic

When an assignment has a `dayOfWeek` value:
- The assignment only applies to that day of the week
- Multiple assignments can exist for the same person-chore pair if they have different `dayOfWeek` values

### History View Filtering

The history view automatically filters out months where no one has any completions (except the current month) to prevent skewed averages from missing data.

## Future Improvement Opportunities

1. **Completion Editing/Deletion**: Add UI to edit or delete completion records (note: chore/assignment editing is now implemented)
2. **Bulk Operations**: Allow recording multiple completions at once
3. **Chore Templates**: Pre-defined chore sets for common household types
4. **Notifications**: Remind people of upcoming or overdue chores
5. **Export/Import**: Export data to CSV or JSON for backup
6. **Authentication**: Add user authentication to restrict admin access
7. **Multi-Household Support**: Support multiple households in one Firebase project
8. **Mobile App**: Native mobile app using React Native
9. **Chore Scheduling**: Visual schedule view showing when chores should be done
10. **Statistics Enhancements**: Charts, graphs, and trend analysis
11. **Recurring Completions**: Mark completions as recurring to auto-populate future dates
12. **Chore Categories**: Group chores by category (cleaning, cooking, maintenance, etc.)
13. **Community Chore Enhancements**:
    - Percentage-based credits instead of tiered system (if desired)
    - Optional "suggested" community chores (not required, but tracked)
    - Charts and graphs for community chore trends
    - Badges/achievements for reaching community chore milestones
    - Optional monthly targets for community chores

## License

MIT

