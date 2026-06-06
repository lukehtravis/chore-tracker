# Chore & Assignment Editing Feature - Detailed Implementation Plan

## Overview

This document outlines the comprehensive implementation plan for adding editing functionality to chores and assignments in the chore-tracker application. The feature will allow users to update chore minutes and assignment frequencies while preserving historical accuracy for past completions.

## Key Requirements

1. **Edit Chores**: Update chore name and/or minutes with an effective date
2. **Edit Assignments**: Update assignment frequency (timesPerMonth) with an effective date
3. **Preserve History**: Old stats calculated with old values, new stats with new values
4. **No Data Migration**: All changes are additive (new optional fields only)
5. **Backward Compatible**: Existing data without versioning fields continues to work

## Data Model Changes

### Chore Collection Schema (Additive Changes Only)

**New Optional Fields:**
```typescript
interface Chore {
  id: string;
  name: string;
  minutes: number;
  
  // NEW OPTIONAL FIELDS:
  effectiveDate?: string;  // YYYY-MM-DD format, when current values became effective
  history?: Array<{
    minutes: number;
    name?: string;  // Store old name if it changed
    effectiveDate: string;  // YYYY-MM-DD, when this version was effective
  }>;
  lastChangedAt?: string;  // ISO timestamp of last edit
}
```

**Behavior:**
- If `effectiveDate` is missing, assume values have been effective since the beginning (or first completion date)
- `history` array stores previous versions in chronological order (oldest first)
- When editing, push current values to `history`, update current values, set `effectiveDate` to user-selected date
- If name changes, store old name in history entry

### Assignment Collection Schema (Additive Changes Only)

**New Optional Fields:**
```typescript
interface Assignment {
  id: string;
  personId: string;
  choreId: string;
  timesPerMonth: number;
  dayOfWeek?: number | null;
  
  // NEW OPTIONAL FIELDS:
  effectiveDate?: string;  // YYYY-MM-DD format
  history?: Array<{
    timesPerMonth: number;
    effectiveDate: string;  // YYYY-MM-DD
  }>;
  lastChangedAt?: string;  // ISO timestamp of last edit
}
```

**Behavior:**
- If `effectiveDate` is missing, assume frequency has been effective since the beginning
- `history` array stores previous frequencies in chronological order
- When editing, push current frequency to `history`, update current frequency, set `effectiveDate`

## Helper Functions to Create

### 1. `getChoreMinutesAtDate(chore, date: string): number`

**Purpose:** Get the chore minutes that were effective on a given date.

**Logic:**
```typescript
function getChoreMinutesAtDate(chore, date: string): number {
  // If no versioning, return current minutes (backward compatible)
  if (!chore.effectiveDate && !chore.history) {
    return chore.minutes;
  }
  
  // Parse target date
  const targetDate = new Date(date + "T12:00:00");
  
  // Check if current version was effective on this date
  if (chore.effectiveDate) {
    const effectiveDate = new Date(chore.effectiveDate + "T12:00:00");
    if (targetDate >= effectiveDate) {
      return chore.minutes; // Current version applies
    }
  }
  
  // Search history for the version that was active on this date
  if (chore.history && chore.history.length > 0) {
    // Sort history by effectiveDate descending (newest first)
    const sortedHistory = [...chore.history].sort((a, b) => 
      new Date(b.effectiveDate + "T12:00:00").getTime() - 
      new Date(a.effectiveDate + "T12:00:00").getTime()
    );
    
    // Find the most recent version that was effective before or on target date
    for (const version of sortedHistory) {
      const versionDate = new Date(version.effectiveDate + "T12:00:00");
      if (targetDate >= versionDate) {
        return version.minutes;
      }
    }
  }
  
  // Fallback: if no version found, use current minutes
  return chore.minutes;
}
```

**Usage:** Replace all instances of `chore.minutes` in calculations with `getChoreMinutesAtDate(chore, completionDate)`.

### 2. `getChoreNameAtDate(chore, date: string): string`

**Purpose:** Get the chore name that was effective on a given date.

**Logic:** Similar to `getChoreMinutesAtDate`, but returns `name` from the appropriate version.

**Usage:** 
- Calendar view tooltips
- Analysis view chore breakdowns
- Any display of chore names for historical completions

### 3. `getAssignmentFrequencyAtDate(assignment, date: string): number`

**Purpose:** Get the assignment frequency that was effective on a given date.

**Logic:** Similar to `getChoreMinutesAtDate`, but searches `assignment.history` for `timesPerMonth`.

**Usage:** Replace all instances of `assignment.timesPerMonth` in expected minutes calculations.

### 4. `getAssignmentFrequencyForMonth(assignment, monthKey: string): number`

**Purpose:** Get the assignment frequency for a specific month (handles month boundaries).

**Logic:**
- For month-specific calculations, use the frequency effective on the first day of the month
- This ensures consistent calculation for the entire month

**Usage:** In month-filtered calculations.

## Calculation Functions to Update

### Critical: All Expected Minutes Calculations

The following functions calculate expected minutes and MUST be updated to use historical values:

#### 1. `calculatePersonStats` (Lines ~1359-1444)

**Current Code Pattern:**
```typescript
personAssignments.forEach((assignment) => {
  const chore = chores.find((c) => c.id === assignment.choreId);
  if (chore) {
    expectedMinutes += chore.minutes * assignment.timesPerMonth * multiplier;
  }
});
```

**Updated Code:**
```typescript
personAssignments.forEach((assignment) => {
  const chore = chores.find((c) => c.id === assignment.choreId);
  if (chore && monthFilter) {
    // For month-specific: use values effective on first day of month
    const monthStartDate = monthFilter + "-01";
    const choreMinutes = getChoreMinutesAtDate(chore, monthStartDate);
    const assignmentFreq = getAssignmentFrequencyAtDate(assignment, monthStartDate);
    expectedMinutes += choreMinutes * assignmentFreq * 1;
  } else if (chore) {
    // For all-time: need to calculate per-completion
    // This is more complex - see "All-Time Calculation Strategy" below
  }
});
```

**Locations:**
- Line ~1392: Month-filtered calculation
- Line ~1404: All-time calculation (no completions)
- Line ~1422: All-time calculation (with completions)

#### 2. `calculatePersonStatsWithoutExpiredDebts` (Lines ~1257-1356)

**Same updates as `calculatePersonStats`:**
- Line ~1310: Month-filtered
- Line ~1318: All-time (no completions)
- Line ~1334: All-time (with completions)

#### 3. `calculateExpiredDebtFee` - Internal Stats Calculation (Lines ~1669-1727)

**Context:** This function calculates stats for a specific month when a debt expired.

**Current Code Pattern:**
```typescript
// Line ~1599-1667: Internal function that calculates stats
personAssignments.forEach((assignment) => {
  const chore = chores.find((c) => c.id === assignment.choreId);
  if (chore) {
    expectedMinutes += chore.minutes * assignment.timesPerMonth * 1;
  }
});
```

**Updated Code:**
- Line ~1629: Month-filtered calculation
- Line ~1637: All-time (no completions)
- Line ~1651: All-time (with completions)

#### 4. House Stats - Chore Completion Status (Lines ~2109-2162)

**Context:** Calculates expected minutes per chore for the current month.

**Current Code Pattern:**
```typescript
assignments.forEach((assignment) => {
  const chore = chores.find((c) => c.id === assignment.choreId);
  if (chore) {
    choreStatus[assignment.choreId].expectedMinutes +=
      assignment.timesPerMonth * chore.minutes;
  }
});
```

**Updated Code (Line ~2148):**
```typescript
assignments.forEach((assignment) => {
  const chore = chores.find((c) => c.id === assignment.choreId);
  if (chore) {
    const monthStartDate = monthKey + "-01";
    const choreMinutes = getChoreMinutesAtDate(chore, monthStartDate);
    const assignmentFreq = getAssignmentFrequencyAtDate(assignment, monthStartDate);
    choreStatus[assignment.choreId].expectedMinutes +=
      assignmentFreq * choreMinutes;
  }
});
```

### Critical: All Chore Name Display

The following locations display chore names and MUST use historical names for past completions:

#### 1. Calendar View - Completion Dots (Lines ~606-640)

**Current Code:**
```typescript
const chore = chores.find((c) => c.id === completion.choreId);
const choreName = chore?.name || "";
```

**Updated Code:**
```typescript
const chore = chores.find((c) => c.id === completion.choreId);
const choreName = chore 
  ? getChoreNameAtDate(chore, completion.date)
  : "";
```

**Impact:** Tooltips and display names will show the name that was effective when the completion was recorded.

#### 2. Analysis View - Chore Breakdown (Lines ~1345, 1433)

**Current Code:**
```typescript
choreBreakdown[chore.name] = (choreBreakdown[chore.name] || 0) + completion.minutes;
```

**Updated Code:**
```typescript
const choreNameAtDate = getChoreNameAtDate(chore, completion.date);
choreBreakdown[choreNameAtDate] = (choreBreakdown[choreNameAtDate] || 0) + completion.minutes;
```

**Impact:** Breakdown will group by the name that was effective at completion time.

#### 3. Analysis View - All-Time Chores (Lines ~2569-2582)

**Current Code:**
```typescript
const chore = chores.find((ch) => ch.id === c.choreId);
if (chore) {
  if (!choreAgg[chore.id]) {
    choreAgg[chore.id] = {
      name: chore.name,
      count: 0,
      totalMinutes: 0,
    };
  }
}
```

**Updated Code:**
- For aggregation, we need to decide: group by chore ID (current name) or by historical name?
- **Decision:** Group by chore ID, but display the current name (or most recent name)
- This keeps the aggregation simple while showing current state

#### 4. Analysis View - Chore Completion Status (Line ~2143)

**Current Code:**
```typescript
choreStatus[assignment.choreId] = {
  choreId: assignment.choreId,
  choreName: chore.name,
  expectedMinutes: 0,
  completedMinutes: 0,
};
```

**Updated Code:**
```typescript
const monthStartDate = monthKey + "-01";
choreStatus[assignment.choreId] = {
  choreId: assignment.choreId,
  choreName: getChoreNameAtDate(chore, monthStartDate),
  expectedMinutes: 0,
  completedMinutes: 0,
};
```

**Impact:** Shows the name that was effective during the month being viewed.

#### 5. Debts View - Chore Names (Lines ~2700, 2753)

**Current Code:**
```typescript
const chore = chores.find((c) => c.id === debt.choreId);
// Display: {chore ? `(${chore.name})` : ""}
```

**Updated Code:**
- Need to get the completion date from `debt.sourceCompletionId`
- Use `getChoreNameAtDate(chore, completionDate)`

**Impact:** Debts show the chore name that was effective when the debt was created.

### All-Time Calculation Strategy

**Problem:** For all-time calculations (no month filter), we need to calculate expected minutes using the values that were effective during each month where completions occurred.

**Current Approach:**
- Count distinct months with completions
- Multiply `chore.minutes * assignment.timesPerMonth * monthsCount`

**New Approach:**
```typescript
// For all-time calculations:
if (personCompletions.length === 0) {
  // No completions: use current values (backward compatible)
  personAssignments.forEach((assignment) => {
    const chore = chores.find((c) => c.id === assignment.choreId);
    if (chore) {
      expectedMinutes += chore.minutes * assignment.timesPerMonth * 1;
    }
  });
} else {
  // Count expected minutes per month, using values effective in that month
  const monthsWithCompletions = new Set();
  personCompletions.forEach((completion) => {
    const monthKey = completion.date.substring(0, 7);
    monthsWithCompletions.add(monthKey);
  });
  
  // For each month, calculate expected minutes using values effective in that month
  monthsWithCompletions.forEach((monthKey) => {
    const monthStartDate = monthKey + "-01";
    personAssignments.forEach((assignment) => {
      const chore = chores.find((c) => c.id === assignment.choreId);
      if (chore) {
        const choreMinutes = getChoreMinutesAtDate(chore, monthStartDate);
        const assignmentFreq = getAssignmentFrequencyAtDate(assignment, monthStartDate);
        expectedMinutes += choreMinutes * assignmentFreq * 1;
      }
    });
  });
}
```

**Impact:** All-time stats will accurately reflect changes over time.

## UI Components to Update

### 1. Admin View - Chores Tab (Lines ~3500-3575)

**Add Edit Button:**
- Add an "Edit" button next to each chore's delete button
- Button opens an edit modal

**Edit Modal:**
- Pre-fill with current `name` and `minutes`
- Date picker for `effectiveDate` (defaults to today)
- Save button that:
  1. Pushes current values to `history` array
  2. Updates `name` and/or `minutes`
  3. Sets `effectiveDate` to selected date
  4. Sets `lastChangedAt` to current timestamp
  5. Updates Firestore document

**Validation:**
- Effective date cannot be in the future
- Name and minutes must be provided
- If name changed, store old name in history entry

### 2. Admin View - Assignments Tab (Lines ~3577-3727)

**Add Edit Button:**
- Add an "Edit" button next to each assignment's delete button
- Button opens an edit modal

**Edit Modal:**
- Pre-fill with current `timesPerMonth`
- Show person and chore (read-only)
- Date picker for `effectiveDate` (defaults to today)
- Save button that:
  1. Pushes current `timesPerMonth` to `history` array
  2. Updates `timesPerMonth`
  3. Sets `effectiveDate` to selected date
  4. Sets `lastChangedAt` to current timestamp
  5. Updates Firestore document

**Validation:**
- Effective date cannot be in the future
- `timesPerMonth` must be > 0

### 3. Record Chore Modal - Chore Dropdown (Lines ~1006-1020)

**Current Display:**
```typescript
{chore.name} ({chore.minutes} min)
```

**Updated Display:**
- Show current values (for new completions, use current values)
- No change needed - we're recording new completions, so current values are correct

**Note:** This is correct as-is. When recording a new completion, we use the current chore minutes.

### 4. Record Chore Modal - Partial Completion Options (Lines ~754-767)

**Current Code:**
```typescript
const getMinuteOptions = () => {
  if (!selectedChoreObj || !selectedChoreObj.minutes) return [];
  const total = selectedChoreObj.minutes;
  // ... generates options up to total
};
```

**Status:** No change needed - uses current minutes for new completions, which is correct.

### 5. Admin View - Display Values (Lines ~3545, 3689-3690)

**Current Display:**
- Chores list: `{chore.name} ({chore.minutes} min)`
- Assignments list: `{assignment.timesPerMonth}x/month = {chore.minutes * assignment.timesPerMonth} min`

**Status:** No change needed - these display current values for reference, which is appropriate for admin view.

## Edge Cases and Considerations

### 1. Backward Compatibility

**Scenario:** Existing chores/assignments without `effectiveDate`/`history` fields.

**Solution:**
- Helper functions check for missing fields
- If missing, return current values (assume they've been effective since the beginning)
- This maintains backward compatibility without migration

### 2. Effective Date Before First Completion

**Scenario:** User sets effective date before any completions exist.

**Solution:**
- Allow it - the values will be used for future calculations
- Historical calculations will use these values for dates >= effectiveDate

### 3. Multiple Edits in Same Month

**Scenario:** User edits a chore multiple times in the same month.

**Solution:**
- Each edit creates a new history entry
- Use the version effective on the specific date being calculated
- For month calculations, use the version effective on the first day of the month

### 4. Editing Chore That Has Assignments

**Scenario:** Editing a chore that is assigned to multiple people.

**Impact:**
- All assignments reference the chore by ID
- When calculating expected minutes, each assignment will use the chore minutes effective on the calculation date
- No cascade updates needed - calculations handle it dynamically

### 5. Editing Assignment That Has Completions

**Scenario:** Editing an assignment that already has completions recorded.

**Impact:**
- Completions are immutable (not affected)
- Expected minutes calculations will use the frequency effective on each completion date
- Historical stats will recalculate correctly

### 6. Chore Name Changes and Grouping

**Scenario:** Chore name changes from "Dishes" to "Wash Dishes".

**Impact:**
- Historical completions will show "Dishes" in breakdowns
- Current completions will show "Wash Dishes"
- Breakdowns may show both names separately

**Decision:** This is acceptable - it accurately reflects what the chore was called at the time.

### 7. All-Time Stats with Multiple Versions

**Scenario:** Calculating all-time stats when a chore had different minutes in different months.

**Solution:**
- Use the per-month calculation strategy outlined above
- Sum expected minutes for each month using values effective in that month
- This ensures accuracy across version changes

### 8. History View Calculations

**Scenario:** History view shows stats for past months.

**Impact:**
- Each month's stats will use the chore/assignment values effective in that month
- This is exactly what we want - accurate historical representation

**Implementation:**
- History view already calls `calculatePersonStatsWithoutExpiredDebts` with month keys
- Our updated helper functions will automatically use correct historical values

### 9. Fee Calculations

**Scenario:** Monthly fees are calculated based on completion percentages.

**Impact:**
- Fees are calculated per month using `calculatePersonStatsWithoutExpiredDebts(monthKey)`
- Our updates ensure expected minutes use correct historical values
- No additional changes needed - fees will be accurate

### 10. Expired Debt Fee Calculations

**Scenario:** Expired debt fees recalculate stats for the month the debt was created.

**Impact:**
- The internal stats calculation in `calculateExpiredDebtFee` will use historical values
- Our updates ensure accuracy

## Implementation Steps

### Phase 1: Helper Functions

1. Create `getChoreMinutesAtDate` function
2. Create `getChoreNameAtDate` function
3. Create `getAssignmentFrequencyAtDate` function
4. Create `getAssignmentFrequencyForMonth` function (if needed)
5. Add unit tests for edge cases (backward compatibility, date boundaries, etc.)

### Phase 2: Update Calculation Functions

1. Update `calculatePersonStats` (3 locations)
2. Update `calculatePersonStatsWithoutExpiredDebts` (3 locations)
3. Update `calculateExpiredDebtFee` internal stats (3 locations)
4. Update house stats chore completion status (1 location)
5. Test with sample data (chore with history, assignment with history)

### Phase 3: Update Display Functions

1. Update calendar view chore name display
2. Update analysis view chore breakdown (2 locations)
3. Update analysis view all-time chores (consider grouping strategy)
4. Update analysis view chore completion status name
5. Update debts view chore names (2 locations)
6. Test display with renamed chores

### Phase 4: All-Time Calculation Strategy

1. Update all-time calculation logic in all 3 calculation functions
2. Test with data spanning multiple months with version changes
3. Verify accuracy of expected minutes calculations

### Phase 5: UI Components

1. Add edit button to chores list
2. Create edit chore modal
3. Add edit button to assignments list
4. Create edit assignment modal
5. Test edit workflows
6. Test validation (future dates, required fields)

### Phase 6: Integration Testing

1. Test complete workflow:
   - Create chore → Record completions → Edit chore → Verify stats
   - Create assignment → Record completions → Edit assignment → Verify stats
2. Test edge cases:
   - Edit before any completions
   - Multiple edits in same month
   - Edit with effective date in past
   - Edit with effective date today
3. Test backward compatibility:
   - Existing data without versioning fields
   - New edits add versioning fields
4. Test calculations:
   - Month-specific stats
   - All-time stats
   - History view
   - Fee calculations

## Testing Checklist

### Functional Tests

- [ ] Edit chore name - verify historical completions show old name
- [ ] Edit chore minutes - verify historical stats use old minutes
- [ ] Edit assignment frequency - verify historical stats use old frequency
- [ ] Edit with effective date in past - verify stats recalculate correctly
- [ ] Edit with effective date today - verify future stats use new values
- [ ] Multiple edits in same month - verify correct version used per date
- [ ] All-time stats with version changes - verify accuracy
- [ ] Month-specific stats with version changes - verify accuracy
- [ ] History view with version changes - verify each month uses correct values
- [ ] Fee calculations with version changes - verify accuracy

### Backward Compatibility Tests

- [ ] Existing chores without versioning - verify calculations work
- [ ] Existing assignments without versioning - verify calculations work
- [ ] Edit adds versioning fields - verify no data corruption
- [ ] Mixed data (some with versioning, some without) - verify all work

### UI Tests

- [ ] Edit chore modal opens with current values
- [ ] Edit assignment modal opens with current values
- [ ] Effective date picker works correctly
- [ ] Validation prevents future dates
- [ ] Validation requires required fields
- [ ] Save updates Firestore correctly
- [ ] UI updates reflect changes immediately

### Edge Case Tests

- [ ] Edit chore with no completions - verify no errors
- [ ] Edit assignment with no completions - verify no errors
- [ ] Edit with effective date before first completion - verify works
- [ ] Edit chore name - verify breakdowns show both names
- [ ] Edit multiple times rapidly - verify history array correct
- [ ] Delete chore after editing - verify cascade delete works

## Risk Assessment

### Low Risk
- Adding optional fields (backward compatible)
- Helper functions (isolated, testable)
- UI components (additive, don't break existing)

### Medium Risk
- Calculation function updates (many locations, need thorough testing)
- All-time calculation strategy (complex logic, needs careful testing)

### Mitigation Strategies
1. Implement helper functions first and test thoroughly
2. Update calculations incrementally, testing after each
3. Use sample data with known expected results
4. Test backward compatibility extensively
5. Consider feature flag for gradual rollout (optional)

## Performance Considerations

### Helper Function Performance

**Concern:** Looking up historical values for every completion could be slow.

**Mitigation:**
- History arrays are small (typically < 10 entries)
- Linear search is fast for small arrays
- Consider caching if performance becomes an issue (unlikely)

### All-Time Calculation Performance

**Concern:** Per-month calculation for all-time stats could be slower.

**Mitigation:**
- Only calculate for months with completions (already done)
- Number of months is limited (typically < 12 for all-time)
- Performance impact should be negligible

## Future Enhancements (Out of Scope)

1. **Bulk Edit**: Edit multiple chores/assignments at once
2. **Edit History View**: Show when and what was changed
3. **Revert Changes**: Undo an edit (restore previous version)
4. **Effective Date Suggestions**: Suggest dates based on completion patterns
5. **Version Comparison**: Show side-by-side comparison of versions

## Summary

This implementation plan provides a comprehensive roadmap for adding editing functionality while preserving historical accuracy. The approach is:

- **Non-breaking**: All changes are additive
- **Backward compatible**: Existing data works without migration
- **Accurate**: Historical stats use historical values
- **Testable**: Clear testing strategy for all components

The key insight is using helper functions to abstract version lookup, allowing all calculation and display code to work with historical values transparently.
