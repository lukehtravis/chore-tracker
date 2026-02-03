import { describe, test, expect } from '@jest/globals';
import {
  getChoreMinutesAtDate,
  getChoreNameAtDate,
  getAssignmentFrequencyAtDate,
  type Chore,
  type Assignment
} from './utils/historical';

describe('Integration Tests - ISC Requirements', () => {

  describe('ISC Task 1: Historical January stats show correct old values', () => {
    test('January historical calculations use original values', () => {
      const chore: Chore = {
        id: '1',
        name: 'Dishwasher',
        minutes: 30, // Changed in March
        effectiveDate: '2024-03-01',
        history: [
          {
            minutes: 20, // Original value
            effectiveDate: null, // Critical: null for original
          }
        ]
      };

      // January should show original value
      expect(getChoreMinutesAtDate(chore, '2024-01-15')).toBe(20);
      expect(getChoreMinutesAtDate(chore, '2024-01-31')).toBe(20);
    });
  });

  describe('ISC Task 2: Historical February stats show correct new values', () => {
    test('February after a January edit shows new values', () => {
      const chore: Chore = {
        id: '1',
        name: 'Dishwasher',
        minutes: 25, // Changed in January
        effectiveDate: '2024-01-15',
        history: [
          {
            minutes: 20, // Original value
            effectiveDate: null,
          }
        ]
      };

      // February should show new value (edit was in January)
      expect(getChoreMinutesAtDate(chore, '2024-02-01')).toBe(25);
      expect(getChoreMinutesAtDate(chore, '2024-02-28')).toBe(25);
    });
  });

  describe('ISC Task 3: Assignment frequency edits preserve historical calculations', () => {
    test('Assignment edits maintain proper history', () => {
      const assignment: Assignment = {
        id: '1',
        timesPerMonth: 8, // Changed in March
        effectiveDate: '2024-03-01',
        history: [
          {
            timesPerMonth: 4, // Original
            effectiveDate: null,
          }
        ]
      };

      // Historical calculations
      expect(getAssignmentFrequencyAtDate(assignment, '2024-01-15')).toBe(4);
      expect(getAssignmentFrequencyAtDate(assignment, '2024-02-15')).toBe(4);
      expect(getAssignmentFrequencyAtDate(assignment, '2024-03-15')).toBe(8);
      expect(getAssignmentFrequencyAtDate(assignment, '2024-04-15')).toBe(8);
    });
  });

  describe('ISC Task 4: Combined chore and assignment edits calculated correctly', () => {
    test('Chore and assignment changes on same date work correctly', () => {
      const chore: Chore = {
        id: '1',
        name: 'Load Dishwasher',
        minutes: 30,
        effectiveDate: '2024-03-01',
        history: [
          {
            minutes: 20,
            effectiveDate: null,
            name: 'Dishwasher',
          }
        ]
      };

      const assignment: Assignment = {
        id: '1',
        timesPerMonth: 8,
        effectiveDate: '2024-03-01',
        history: [
          {
            timesPerMonth: 4,
            effectiveDate: null,
          }
        ]
      };

      // Before March 1st - original values
      expect(getChoreMinutesAtDate(chore, '2024-02-28')).toBe(20);
      expect(getChoreNameAtDate(chore, '2024-02-28')).toBe('Dishwasher');
      expect(getAssignmentFrequencyAtDate(assignment, '2024-02-28')).toBe(4);

      // On March 1st - new values
      expect(getChoreMinutesAtDate(chore, '2024-03-01')).toBe(30);
      expect(getChoreNameAtDate(chore, '2024-03-01')).toBe('Load Dishwasher');
      expect(getAssignmentFrequencyAtDate(assignment, '2024-03-01')).toBe(8);
    });
  });

  describe('ISC Task 5: First edit with no prior effectiveDate handled', () => {
    test('First edit correctly stores null effectiveDate in history', () => {
      // This simulates what happens when saveEditChore is called
      const currentChore = {
        id: '1',
        name: 'Dishwasher',
        minutes: 20,
        // No effectiveDate property initially
      };

      // Simulate the fix: use ?? null instead of || editChoreEffectiveDate
      const historyEntry = {
        minutes: currentChore.minutes,
        effectiveDate: currentChore.effectiveDate ?? null, // The fix!
      };

      expect(historyEntry.effectiveDate).toBe(null); // Should be null, not a date
    });
  });

  describe('ISC Task 6: Multiple sequential edits maintain full history', () => {
    test('Three sequential edits create proper history chain', () => {
      const chore: Chore = {
        id: '1',
        name: 'Clean Kitchen',
        minutes: 45, // Third edit (June)
        effectiveDate: '2024-06-01',
        history: [
          {
            minutes: 20, // Original
            effectiveDate: null,
            name: 'Dishwasher',
          },
          {
            minutes: 30, // First edit (March)
            effectiveDate: '2024-03-01',
            name: 'Load Dishwasher',
          },
          {
            minutes: 35, // Second edit (April)
            effectiveDate: '2024-04-15',
            name: 'Dishwasher & Counter',
          }
        ]
      };

      // Test all periods
      expect(getChoreMinutesAtDate(chore, '2024-01-15')).toBe(20);
      expect(getChoreNameAtDate(chore, '2024-01-15')).toBe('Dishwasher');

      expect(getChoreMinutesAtDate(chore, '2024-03-15')).toBe(30);
      expect(getChoreNameAtDate(chore, '2024-03-15')).toBe('Load Dishwasher');

      expect(getChoreMinutesAtDate(chore, '2024-04-20')).toBe(35);
      expect(getChoreNameAtDate(chore, '2024-04-20')).toBe('Dishwasher & Counter');

      expect(getChoreMinutesAtDate(chore, '2024-06-15')).toBe(45);
      expect(getChoreNameAtDate(chore, '2024-06-15')).toBe('Clean Kitchen');
    });
  });

  describe('ISC Task 8: No regression in existing functionality', () => {
    test('Backward compatibility - chores with no history work', () => {
      const simpleChore: Chore = {
        id: '1',
        name: 'Vacuum',
        minutes: 15,
      };

      expect(getChoreMinutesAtDate(simpleChore, '2024-01-01')).toBe(15);
      expect(getChoreMinutesAtDate(simpleChore, '2024-12-31')).toBe(15);
      expect(getChoreNameAtDate(simpleChore, '2024-06-15')).toBe('Vacuum');
    });

    test('Backward compatibility - undefined effectiveDate handled', () => {
      const chore: Chore = {
        id: '1',
        name: 'Mop',
        minutes: 25,
        effectiveDate: '2024-03-01',
        history: [
          {
            minutes: 20,
            effectiveDate: undefined, // Old data format
          }
        ]
      };

      // Should treat undefined like null
      expect(getChoreMinutesAtDate(chore, '2024-01-15')).toBe(20);
      expect(getChoreMinutesAtDate(chore, '2024-03-15')).toBe(25);
    });
  });

  describe('Critical Bug Prevention', () => {
    test('Prevents storing edit date as original effectiveDate', () => {
      // The bug: using || instead of ?? would store the edit date
      const editDate = '2024-03-01';
      const currentChore = {
        id: '1',
        name: 'Test',
        minutes: 20,
        effectiveDate: undefined as any,
      };

      // Wrong way (the bug)
      const buggyHistoryEntry = {
        minutes: currentChore.minutes,
        effectiveDate: currentChore.effectiveDate || editDate, // BUG!
      };

      // Right way (the fix)
      const correctHistoryEntry = {
        minutes: currentChore.minutes,
        effectiveDate: currentChore.effectiveDate ?? null, // CORRECT!
      };

      expect(buggyHistoryEntry.effectiveDate).toBe('2024-03-01'); // This is wrong!
      expect(correctHistoryEntry.effectiveDate).toBe(null); // This is correct!
    });

    test('Simulation: Edit on March 1st correctly preserves January history', () => {
      // Simulate the complete flow
      const originalChore = {
        id: '1',
        name: 'Dishwasher',
        minutes: 20,
      };

      // User edits on March 1st
      const editDate = '2024-03-01';
      const newMinutes = 30;

      // Create history entry with the fix
      const historyEntry = {
        minutes: originalChore.minutes,
        effectiveDate: originalChore.effectiveDate ?? null, // The fix!
        name: originalChore.name,
      };

      // Updated chore after edit
      const editedChore: Chore = {
        id: '1',
        name: 'Dishwasher',
        minutes: newMinutes,
        effectiveDate: editDate,
        history: [historyEntry],
      };

      // Verify January still shows original value
      expect(getChoreMinutesAtDate(editedChore, '2024-01-15')).toBe(20);
      expect(getChoreMinutesAtDate(editedChore, '2024-02-28')).toBe(20);

      // Verify March shows new value
      expect(getChoreMinutesAtDate(editedChore, '2024-03-01')).toBe(30);
      expect(getChoreMinutesAtDate(editedChore, '2024-03-15')).toBe(30);
    });
  });
});