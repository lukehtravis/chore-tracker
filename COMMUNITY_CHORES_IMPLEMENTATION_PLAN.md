# Community Chores Feature - Implementation Plan

## Overview

This document outlines the implementation plan for adding a "Community Chores" feature to the chore-tracker application. Community chores are unassigned chores that can be done by anyone, tracked separately from individual chores, and have their own reward/penalty system.

## Key Decisions Summary

- **Credit System**: Fixed credit per minute range (tiered system) - no expectations or goals for community minutes
- **Visual Design**: Square badges in teal/cyan color for community chores (vs circular dots for individual)
- **Goals**: No monthly or per-person goals for community minutes - purely optional and reward-based
- **Default Credit Tiers**: 0-29 min = $0, 30-59 = $5, 60-89 = $10, 90-119 = $15, 120+ = $20 (configurable in Admin)

## Core Concepts

### Individual vs Community Chores

**Individual Chores (Existing System):**
- Assigned to specific people via `assignments` collection
- Count toward individual completion percentages
- Count toward house-wide completion percentages
- Use existing fee/credit calculation system
- Can create debts between people

**Community Chores (New System):**
- Not assigned to anyone (no assignments)
- Do NOT count toward individual completion percentages
- Do NOT count toward house-wide completion percentages
- Tracked separately as "Community Chore Minutes"
- Have their own independent fee/credit calculation system
- Cannot create debts (no cross-person favor tracking)

### Key Design Decisions

1. **Data Separation**: Community completions are stored in the same `completions` collection but marked with a `type: "community"` field to distinguish them
2. **Parallel Tracking**: All existing stats calculations remain unchanged; community stats are calculated in parallel
3. **Independent Rewards**: Community chores have separate fee settings (reward threshold, reward amount, penalty modifier)
4. **Visual Distinction**: UI clearly separates Individual and Community stats throughout the application

## Data Model Changes

### 1. New Collection: `communityChoreTypes`

Stores the types/categories of community chores that can be done.

```typescript
interface CommunityChoreType {
  id: string;           // Unique identifier (generated)
  name: string;         // Name of the community chore type (e.g., "Yard Work", "Deep Clean", "Organizing")
  createdAt: string;    // ISO timestamp
}
```

**Operations:**
- Create: Add new community chore type via Admin panel
- Read: Real-time listener syncs all community chore types
- Delete: Removes community chore type (does NOT delete completions, but they become orphaned)

**Note:** Unlike regular chores, community chore types don't have a fixed `minutes` value. Minutes are entered directly when recording the completion.

### 2. Modified Collection: `completions`

Add a new field to distinguish community completions from individual completions.

```typescript
interface Completion {
  id: string;
  date: string;
  completedBy: string;
  choreId: string;              // For individual chores, references chore.id
  minutes: number;
  createdAt: string;
  forPersonId: string | null;    // Only used for individual chores
  isProvisional?: boolean;       // Only used for individual chores
  sourceDebtId?: string;         // Only used for individual chores
  
  // NEW FIELD:
  type?: "individual" | "community";  // Defaults to "individual" for backward compatibility
  
  // NEW FIELDS (only present when type === "community"):
  communityChoreTypeId?: string;      // References communityChoreType.id
}
```

**Key Behaviors:**
- If `type === "community"`:
  - `choreId` may be empty/null (or could reference a placeholder)
  - `forPersonId` is always null (no cross-person tracking)
  - `isProvisional` and `sourceDebtId` are always undefined
  - `communityChoreTypeId` must be present
- If `type === "individual"` (or undefined for backward compatibility):
  - All existing logic applies
  - `communityChoreTypeId` is undefined

### 3. Modified Collection: `feeSettings`

Extend the singleton to include community chore credit settings.

```typescript
interface FeeSettings {
  id: "settings";
  // Individual chore settings (existing)
  rewardThreshold: number;
  rewardAmount: number;
  penaltyModifier: number;
  
  // NEW: Community chore credit tiers
  communityCreditTiers: Array<{ min: number; credit: number }>;  // Tiered credit system
  // Default: [
  //   { min: 0, credit: 0 },
  //   { min: 30, credit: 5 },
  //   { min: 60, credit: 10 },
  //   { min: 90, credit: 15 },
  //   { min: 120, credit: 20 }
  // ]
  
  lastUpdated: string;
}
```

**Migration:** When loading fee settings, if `communityCreditTiers` doesn't exist, initialize it with the default tier structure shown above.

### 4. Modified Collection: `monthlyFees`

Add community chore credit to the monthly fee record.

```typescript
interface MonthlyFee {
  id: string;
  personId: string;
  monthKey: string;
  baseFee: number;              // From individual completion %
  expiredDebtFees: number;      // From expired individual debts
  totalFee: number;             // baseFee + expiredDebtFees (for backward compatibility)
  calculatedAt: string;
  processed: boolean;
  
  // NEW FIELD:
  communityChoreCredit: number; // Credit from community chores (always positive or 0)
}
```

**Note:** Community chore credits are always positive (or zero). They reduce the total fee owed. The actual total fee calculation becomes:
```typescript
actualTotalFee = totalFee - communityChoreCredit
```

## UI/UX Changes

### 1. RecordChoreModal Component

**Location:** `App.tsx` - `RecordChoreModal` function

**Changes:**
1. Add a toggle/switch in the top-right corner of the modal header
   - Default: "Individual" mode (current behavior)
   - Toggled: "Community" mode
   - Visual indicator showing which mode is active

2. **Individual Mode (Default):**
   - Current form behavior unchanged
   - All existing fields and logic

3. **Community Mode:**
   - Hide: Chore dropdown (not needed)
   - Show:
     - **Person who did the chore** (dropdown) - Required
     - **Community Chore Type** (dropdown) - Required, populated from `communityChoreTypes` collection
     - **Minutes** (number input or dropdown) - Required
       - Suggest: Allow free-form number input with validation (1-999 minutes)
       - Or: Provide common minute options (15, 30, 45, 60, 90, 120, etc.)
   - Hide: All debt-related fields (forPersonId, dueDate, partial completion)
   - Hide: "Who was this chore for?" dropdown

**Implementation Notes:**
- Use state to track mode: `const [isCommunityMode, setIsCommunityMode] = useState(false)`
- Conditionally render form fields based on mode
- Reset form state when toggling modes
- Update `handleSave` to handle both modes

### 2. Calendar View

**Location:** `App.tsx` - `CalendarView` component

**Changes:**
- Community completions should appear on the calendar with a different visual style
- **Visual Design Decision:**
  - **Individual chores**: Circular dots (current design)
  - **Community chores**: Square badges with distinct styling
  - **Color**: Use a complementary color (e.g., teal/cyan) to distinguish from individual chore colors
  - **Border**: Optional dashed or double border to further distinguish
- Tooltip: Show "Community: [Type] - [Minutes] min" instead of chore name

**Implementation:**
- Filter completions by `type === "community"` when rendering community badges
- Apply CSS classes: `community-completion-badge` for community vs `completion-dot` for individual
- Use distinct color palette (e.g., `bg-teal-500` or `bg-cyan-500` for community)

### 3. Analysis View - Individual Tab

**Location:** `App.tsx` - `AnalysisView` component, `selectedTab === "individual"`

**Changes:**
- Add a section below each person's individual stats showing their community chore contributions
- Display format:
  ```
  Community Chores
  ┌─────────────────────────────────┐
  │ Total Minutes: 120              │
  │ This Month: 45                  │
  │ All-Time: 120                   │
  │                                 │
  │ Breakdown by Type:              │
  │ • Yard Work: 60 min             │
  │ • Deep Clean: 45 min            │
  │ • Organizing: 15 min            │
  └─────────────────────────────────┘
  ```

**Implementation:**
- Create new function: `calculatePersonCommunityStats(personId, monthFilter)`
- Returns: `{ totalMinutes, thisMonthMinutes, allTimeMinutes, breakdownByType }`
- Breakdown by type: Group completions by `communityChoreTypeId` and sum minutes

### 4. Analysis View - House Total Tab

**Location:** `App.tsx` - `AnalysisView` component, `selectedTab === "house"`

**Changes:**
- Add a parallel section for Community Chores
- Display format:
  ```
  Individual Chores (existing)
  ┌─────────────────────────────────┐
  │ Expected: 1200 min              │
  │ Completed: 1080 min              │
  │ Percentage: 90%                  │
  └─────────────────────────────────┘

  Community Chores (new)
  ┌─────────────────────────────────┐
  │ Total Minutes: 450              │
  │ This Month: 120                 │
  │ Contributors: 3 people          │
  │                                 │
  │ Top Contributors:               │
  │ • Alice: 60 min                 │
  │ • Bob: 45 min                   │
  │ • Charlie: 15 min               │
  └─────────────────────────────────┘
  ```

**Implementation:**
- Create new function: `calculateHouseCommunityStats(monthFilter)`
- Returns: `{ totalMinutes, thisMonthMinutes, contributors, topContributors }`
- Top contributors: Sort people by their community minutes for the month

### 5. Analysis View - History Tab

**Location:** `App.tsx` - `AnalysisView` component, `selectedTab === "history"`

**Changes:**
- Add a second table below the existing Individual table
- Table columns:
  - Month
  - Total Community Minutes (house-wide)
  - Per-Person breakdown (columns for each person)
- Format similar to existing history table but simpler (no percentages, just minutes)

**Implementation:**
- Extend `getLastNMonths` usage to calculate community stats per month
- Create table rows showing month, total, and per-person contributions

### 6. Analysis View - Fees/Credits Tab

**Location:** `App.tsx` - `AnalysisView` component, `selectedTab === "fees"`

**Changes:**
- Add new column: "Community Chore Credit"
- Update "Total" column calculation to subtract community credit
- Display format:
  ```
  Total = Base Fee + Expired Debt Fees - Community Chore Credit
  ```
- If community credit exceeds total fees, show as negative (credit)

**Implementation:**
- Update `calculateMonthlyFees` function to include community credit calculation
- Update table rendering to show new column
- Update total calculation: `actualTotal = totalFee - communityChoreCredit`

### 7. Admin View - New Tab: Community Chore Types

**Location:** `App.tsx` - `AdminView` component

**Changes:**
- Add new tab: "Community Chores" (after "Fee Settings")
- Interface similar to "Chores" tab but simpler:
  - Input field for community chore type name
  - "Add" button
  - List of existing types with delete button
- No minutes field (minutes are entered per completion)

**Implementation:**
- Add state: `const [communityChoreTypes, setCommunityChoreTypes] = useState([])`
- Add Firebase listener for `communityChoreTypes` collection in main `App` component
- Pass `communityChoreTypes` as prop to `AdminView`
- Add CRUD functions: `addCommunityChoreType`, `deleteCommunityChoreType`
- Add UI section in AdminView with:
  - Input field for type name
  - "Add" button
  - List of types with delete buttons
  - Warning message if deleting a type that has completions (informational only)

### 8. Admin View - Fee Settings Tab

**Location:** `App.tsx` - `AdminView` component, `activeSection === "feeSettings"`

**Changes:**
- Add a new section below individual fee settings: "Community Chore Credit Settings"
- **Tier Management Interface:**
  - Display current tiers in a table/list
  - Allow adding new tiers (min minutes, credit amount)
  - Allow editing existing tiers
  - Allow deleting tiers (with validation to keep at least one tier)
  - Tiers must be sorted by `min` in ascending order
  - Show example: "If someone does 60 minutes, they earn $10 credit"
- Include example calculation display showing how credits are calculated

**Implementation:**
- Add state: `const [communityCreditTiers, setCommunityCreditTiers] = useState([])`
- Initialize from `feeSettings.communityCreditTiers` or use defaults
- Add UI for managing tiers (add/edit/delete)
- Update `handleSaveFeeSettings` to save `communityCreditTiers` array
- Validate tiers on save (ensure sorted, no duplicates, at least one tier)

## Business Logic & Calculations

### Community Stats Calculation

#### Per-Person Community Stats

```typescript
function calculatePersonCommunityStats(personId: string, monthFilter: string | null) {
  // Filter completions: type === "community" AND completedBy === personId
  const communityCompletions = completions.filter(c => {
    if (c.type !== "community") return false;
    if (c.completedBy !== personId) return false;
    if (monthFilter && !c.date.startsWith(monthFilter)) return false;
    return true;
  });

  const totalMinutes = communityCompletions.reduce((sum, c) => sum + c.minutes, 0);
  
  // Breakdown by type
  const breakdownByType: Record<string, number> = {};
  communityCompletions.forEach(c => {
    const typeName = communityChoreTypes.find(t => t.id === c.communityChoreTypeId)?.name || "Unknown";
    breakdownByType[typeName] = (breakdownByType[typeName] || 0) + c.minutes;
  });

  return {
    totalMinutes,
    breakdownByType,
    // For month-specific calculations
    thisMonthMinutes: monthFilter ? totalMinutes : undefined,
    allTimeMinutes: monthFilter ? undefined : totalMinutes
  };
}
```

#### House-Wide Community Stats

```typescript
function calculateHouseCommunityStats(monthFilter: string | null) {
  const communityCompletions = completions.filter(c => {
    if (c.type !== "community") return false;
    if (monthFilter && !c.date.startsWith(monthFilter)) return false;
    return true;
  });

  const totalMinutes = communityCompletions.reduce((sum, c) => sum + c.minutes, 0);
  
  // Per-person contributions
  const perPerson: Record<string, number> = {};
  communityCompletions.forEach(c => {
    perPerson[c.completedBy] = (perPerson[c.completedBy] || 0) + c.minutes;
  });

  const topContributors = Object.entries(perPerson)
    .map(([personId, minutes]) => ({
      personId,
      minutes,
      name: people.find(p => p.id === personId)?.name || "Unknown"
    }))
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 5); // Top 5

  return {
    totalMinutes,
    contributors: Object.keys(perPerson).length,
    topContributors
  };
}
```

### Community Chore Credit Calculation

#### Per-Person Monthly Credit

**Decision: Fixed Credit Per Minute Range (Tiered System)**

Community chores use a tiered credit system based on total minutes completed in the month. There are no expectations or goals for community minutes - credits are purely reward-based.

The tier thresholds and credit amounts are configurable in the Admin panel (Community Fee Settings), but default to:

```typescript
function calculateCommunityChoreCredit(personId: string, monthKey: string, feeSettings: FeeSettings) {
  const stats = calculatePersonCommunityStats(personId, monthKey);
  const totalMinutes = stats.totalMinutes;

  // Use tiered credit system from feeSettings
  // Default tiers (configurable in Admin):
  // 0-29 min: $0
  // 30-59 min: $5
  // 60-89 min: $10
  // 90-119 min: $15
  // 120+ min: $20
  
  // Fee settings will store:
  // communityCreditTiers: [{ min: 0, credit: 0 }, { min: 30, credit: 5 }, ...]
  
  const tiers = feeSettings.communityCreditTiers || [
    { min: 0, credit: 0 },
    { min: 30, credit: 5 },
    { min: 60, credit: 10 },
    { min: 90, credit: 15 },
    { min: 120, credit: 20 },
  ];

  // Find the highest tier the person qualifies for
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

**Note:** The tier system is stored in `feeSettings.communityCreditTiers` as an array of `{ min: number, credit: number }` objects, sorted by `min` in ascending order.

### Updated Monthly Fee Calculation

```typescript
async function calculateMonthlyFees(monthKey: string) {
  // ... existing individual fee calculation ...
  
  // Calculate community credits for each person
  for (const person of people) {
    const communityCredit = calculateCommunityChoreCredit(
      person.id,
      monthKey,
      feeSettings
    );

    // Update or create monthlyFee record
    const existingFee = monthlyFees.find(
      f => f.personId === person.id && f.monthKey === monthKey
    );

    const feeData = {
      // ... existing fields ...
      communityChoreCredit: communityCredit,
      // Note: totalFee remains as (baseFee + expiredDebtFees)
      // Actual total = totalFee - communityChoreCredit (calculated in UI)
    };

    if (existingFee) {
      await updateDoc(doc(db, "monthlyFees", existingFee.id), feeData);
    } else {
      const id = generateId();
      await setDoc(doc(db, "monthlyFees", id), {
        id,
        personId: person.id,
        monthKey,
        ...feeData
      });
    }
  }
}
```

## Implementation Steps

### Phase 1: Data Model & Backend

1. **Add Firebase Collection Listener**
   - Add `communityChoreTypes` collection listener in main `App` component
   - Add state: `const [communityChoreTypes, setCommunityChoreTypes] = useState([])`

2. **Update Fee Settings**
   - Modify `feeSettings` listener to initialize community settings if missing
   - Add default values for community settings

3. **Update Completion Data Structure**
   - Modify `RecordChoreModal.handleSave` to support `type` field
   - Ensure backward compatibility (default `type` to `"individual"` if not set)

### Phase 2: Admin Interface

4. **Add Community Chore Types Tab**
   - Create UI in `AdminView` for managing community chore types
   - Add CRUD operations (Create, Delete)
   - Test adding/removing types

5. **Update Fee Settings Tab**
   - Add community fee settings section
   - Update save handler to persist both individual and community settings
   - Add example calculation display

### Phase 3: Calendar Entry

6. **Update RecordChoreModal**
   - Add toggle switch in header
   - Add state for mode (`isCommunityMode`)
   - Conditionally render form fields based on mode
   - Update `handleSave` to handle community completions
   - Test both modes

7. **Update Calendar View**
   - Modify dot rendering to distinguish community completions
   - Update tooltips for community completions
   - Test visual distinction

### Phase 4: Analysis Views

8. **Add Community Stats Functions**
   - Implement `calculatePersonCommunityStats`
   - Implement `calculateHouseCommunityStats`
   - Test calculations with sample data

9. **Update Individual Tab**
   - Add community stats section below individual stats
   - Display breakdown by type
   - Test display

10. **Update House Total Tab**
    - Add community stats section
    - Display top contributors
    - Test display

11. **Update History Tab**
    - Add community history table
    - Calculate per-month community stats
    - Test display

12. **Update Fees/Credits Tab**
    - Add community credit calculation function
    - Update `calculateMonthlyFees` to include community credits
    - Add "Community Chore Credit" column to table
    - Update total calculation
    - Test fee calculation and display

### Phase 5: Testing & Refinement

13. **End-to-End Testing**
    - Test complete flow: Add community chore type → Record community completion → View stats → Calculate fees
    - Test backward compatibility (existing individual completions still work)
    - Test edge cases (no community completions, all community completions, etc.)

14. **UI/UX Refinement**
    - Ensure visual consistency across all views
    - Add helpful tooltips/explanations where needed
    - Verify responsive design

## Creative Suggestions for Data Representation

### 1. Visual Distinction in Calendar
- **Individual chores**: Circular dots (current design)
- **Community chores**: Square badges in teal/cyan color
- **Implementation**: Use `rounded-sm` or `rounded-none` for squares vs `rounded-full` for circles

### 2. Community Stats Visualization
- **Simple breakdown**: Text-based breakdown by type (as outlined in Individual tab)
- **Top contributors**: List format showing who contributed most (as outlined in House Total tab)
- **History table**: Simple table format showing monthly totals (as outlined in History tab)

### 3. Breakdown Display
- **Text-based breakdown**: Show community chore types with minutes (no charts needed for MVP)
- **Monthly totals**: Simple number display for monthly community minutes

### 4. Integration Ideas (Future Enhancements)
- **Recognition**: Highlight top community contributors in the House Total tab (already included)
- **Charts**: Could add pie charts or bar charts in future if desired (not in MVP)

## Design Decisions Made

1. **Community Credit Calculation Method**
   - **Decision**: Tiered system (fixed credits for minute ranges)
   - **Implementation**: Configurable tiers stored in `feeSettings.communityCreditTiers`
   - **Default tiers**: 0-29 min = $0, 30-59 = $5, 60-89 = $10, 90-119 = $15, 120+ = $20
   - **No expectations**: There are no expected amounts or goals for community minutes

2. **Community Chore Type Management**
   - **Decision**: Allow deletion, but keep completions (they become "orphaned")
   - **Implementation**: When displaying completions with deleted types, show "Unknown" or the type ID
   - **Alternative considered**: Prevent deletion if completions exist (rejected - too restrictive)

3. **Community Chore Goals**
   - **Decision**: No monthly or per-person goals for community minutes
   - **Rationale**: Community chores are purely optional and reward-based, no expectations

4. **Visual Design**
   - **Decision**: Square badges in teal/cyan color for community chores
   - **Individual chores**: Keep existing circular dots
   - **Implementation**: Use distinct CSS classes and color palette

5. **Backward Compatibility**
   - **Decision**: Default to `"individual"` when `type` is undefined
   - **Implementation**: All existing completions without `type` field are treated as individual chores

## Testing Checklist

- [ ] Add community chore type in Admin
- [ ] Record community completion via calendar modal
- [ ] Verify community completion appears on calendar with distinct styling
- [ ] View community stats in Individual tab
- [ ] View community stats in House Total tab
- [ ] View community history in History tab
- [ ] Calculate fees with community credits
- [ ] Verify community credits appear in Fees/Credits tab
- [ ] Test backward compatibility (existing individual completions still work)
- [ ] Test edge cases (no community completions, deleting community chore type, etc.)
- [ ] Verify real-time updates work for community data
- [ ] Test on different screen sizes (responsive design)

## Future Enhancements (Post-MVP)

1. **Percentage-Based Credits**: Switch from tiered to percentage-based credit calculation (if desired)
2. **Community Chore Assignments**: Optional "suggested" community chores (not required, but tracked)
3. **Analytics**: Charts and graphs for community chore trends (pie charts, bar charts, etc.)
4. **Notifications**: Remind people about community chore opportunities
5. **Recurring Community Chores**: Mark certain community chores as recurring
6. **Community Chore Goals**: Optional monthly targets (if desired in future)
7. **Badges/Achievements**: Award badges for reaching community chore milestones

---

## Summary

This implementation plan provides a comprehensive guide for adding Community Chores functionality to the chore-tracker application. The feature maintains clear separation between individual and community tracking while integrating seamlessly into the existing UI and fee structure.

Key principles:
- **Separation**: Community chores are tracked separately and don't affect individual percentages
- **Parallel Architecture**: Community system mirrors individual system where appropriate
- **Independent Rewards**: Community chores have their own fee/credit system
- **Backward Compatibility**: Existing individual chore functionality remains unchanged

The plan is structured to be implemented incrementally, with each phase building on the previous one. Start with Phase 1 (data model) and work through each phase systematically.

