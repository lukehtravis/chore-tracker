import { describe, test, expect } from '@jest/globals';
import {
  getChoreMinutesAtDate,
  getChoreNameAtDate,
  getAssignmentFrequencyAtDate,
  type Chore,
  type Assignment
} from './historical';

describe('Chore Minutes Historical Calculations', () => {
  test('getChoreMinutesAtDate with no history returns current minutes', () => {
    const chore: Chore = {
      id: '1',
      name: 'Dishwasher',
      minutes: 20,
    };

    expect(getChoreMinutesAtDate(chore, '2024-03-15')).toBe(20);
    expect(getChoreMinutesAtDate(chore, '2024-01-01')).toBe(20);
    expect(getChoreMinutesAtDate(chore, '2025-12-31')).toBe(20);
  });

  test('getChoreMinutesAtDate with first edit (null effectiveDate in history)', () => {
    // This tests the CRITICAL bug fix: when a chore is edited for the first time,
    // the history entry should have effectiveDate: null to indicate it's the original value
    const chore: Chore = {
      id: '1',
      name: 'Dishwasher',
      minutes: 30, // New value after edit
      effectiveDate: '2024-03-01',
      history: [
        {
          minutes: 20, // Original value
          effectiveDate: null, // This should be null, not the edit date!
        }
      ]
    };

    // Before March 1st, should return the original value (20)
    expect(getChoreMinutesAtDate(chore, '2024-01-15')).toBe(20);
    expect(getChoreMinutesAtDate(chore, '2024-02-28')).toBe(20);

    // On and after March 1st, should return the new value (30)
    expect(getChoreMinutesAtDate(chore, '2024-03-01')).toBe(30);
    expect(getChoreMinutesAtDate(chore, '2024-03-15')).toBe(30);
    expect(getChoreMinutesAtDate(chore, '2024-12-31')).toBe(30);
  });

  test('getChoreMinutesAtDate with multiple edits', () => {
    const chore: Chore = {
      id: '1',
      name: 'Dishwasher',
      minutes: 35, // Current value (third version)
      effectiveDate: '2024-06-01',
      history: [
        {
          minutes: 20, // Original value
          effectiveDate: null,
        },
        {
          minutes: 30, // Second version
          effectiveDate: '2024-03-01',
        }
      ]
    };

    // Original period (before March)
    expect(getChoreMinutesAtDate(chore, '2024-01-15')).toBe(20);
    expect(getChoreMinutesAtDate(chore, '2024-02-28')).toBe(20);

    // Second version period (March to May)
    expect(getChoreMinutesAtDate(chore, '2024-03-01')).toBe(30);
    expect(getChoreMinutesAtDate(chore, '2024-04-15')).toBe(30);
    expect(getChoreMinutesAtDate(chore, '2024-05-31')).toBe(30);

    // Current version period (June onwards)
    expect(getChoreMinutesAtDate(chore, '2024-06-01')).toBe(35);
    expect(getChoreMinutesAtDate(chore, '2024-12-31')).toBe(35);
  });

  test('getChoreMinutesAtDate handles backward compatibility with undefined effectiveDate', () => {
    // For backward compatibility, undefined effectiveDate should be treated like null
    const chore: Chore = {
      id: '1',
      name: 'Dishwasher',
      minutes: 30,
      effectiveDate: '2024-03-01',
      history: [
        {
          minutes: 20,
          effectiveDate: undefined, // Old data might have undefined
        }
      ]
    };

    // Should handle undefined same as null
    expect(getChoreMinutesAtDate(chore, '2024-01-15')).toBe(20);
    expect(getChoreMinutesAtDate(chore, '2024-03-01')).toBe(30);
  });
});

describe('Chore Name Historical Calculations', () => {
  test('getChoreNameAtDate with no history returns current name', () => {
    const chore: Chore = {
      id: '1',
      name: 'Dishwasher',
      minutes: 20,
    };

    expect(getChoreNameAtDate(chore, '2024-03-15')).toBe('Dishwasher');
    expect(getChoreNameAtDate(chore, '2024-01-01')).toBe('Dishwasher');
  });

  test('getChoreNameAtDate with first edit (null effectiveDate in history)', () => {
    const chore: Chore = {
      id: '1',
      name: 'Load Dishwasher', // New name after edit
      minutes: 20,
      effectiveDate: '2024-03-01',
      history: [
        {
          minutes: 20,
          effectiveDate: null,
          name: 'Dishwasher', // Original name
        }
      ]
    };

    // Before March 1st, should return the original name
    expect(getChoreNameAtDate(chore, '2024-01-15')).toBe('Dishwasher');
    expect(getChoreNameAtDate(chore, '2024-02-28')).toBe('Dishwasher');

    // On and after March 1st, should return the new name
    expect(getChoreNameAtDate(chore, '2024-03-01')).toBe('Load Dishwasher');
    expect(getChoreNameAtDate(chore, '2024-12-31')).toBe('Load Dishwasher');
  });

  test('getChoreNameAtDate with multiple name changes', () => {
    const chore: Chore = {
      id: '1',
      name: 'Clean & Load Dishwasher', // Current name
      minutes: 20,
      effectiveDate: '2024-06-01',
      history: [
        {
          minutes: 20,
          effectiveDate: null,
          name: 'Dishwasher', // Original
        },
        {
          minutes: 20,
          effectiveDate: '2024-03-01',
          name: 'Load Dishwasher', // Second version
        }
      ]
    };

    // Original period
    expect(getChoreNameAtDate(chore, '2024-01-15')).toBe('Dishwasher');

    // Second version period
    expect(getChoreNameAtDate(chore, '2024-03-01')).toBe('Load Dishwasher');
    expect(getChoreNameAtDate(chore, '2024-04-15')).toBe('Load Dishwasher');

    // Current version
    expect(getChoreNameAtDate(chore, '2024-06-01')).toBe('Clean & Load Dishwasher');
  });
});

describe('Assignment Frequency Historical Calculations', () => {
  test('getAssignmentFrequencyAtDate with no history returns current frequency', () => {
    const assignment: Assignment = {
      id: '1',
      timesPerMonth: 4,
    };

    expect(getAssignmentFrequencyAtDate(assignment, '2024-03-15')).toBe(4);
    expect(getAssignmentFrequencyAtDate(assignment, '2024-01-01')).toBe(4);
  });

  test('getAssignmentFrequencyAtDate with first edit (null effectiveDate in history)', () => {
    const assignment: Assignment = {
      id: '1',
      timesPerMonth: 8, // New frequency after edit
      effectiveDate: '2024-03-01',
      history: [
        {
          timesPerMonth: 4, // Original frequency
          effectiveDate: null, // Should be null for original value
        }
      ]
    };

    // Before March 1st, should return the original frequency
    expect(getAssignmentFrequencyAtDate(assignment, '2024-01-15')).toBe(4);
    expect(getAssignmentFrequencyAtDate(assignment, '2024-02-28')).toBe(4);

    // On and after March 1st, should return the new frequency
    expect(getAssignmentFrequencyAtDate(assignment, '2024-03-01')).toBe(8);
    expect(getAssignmentFrequencyAtDate(assignment, '2024-12-31')).toBe(8);
  });

  test('getAssignmentFrequencyAtDate with multiple edits', () => {
    const assignment: Assignment = {
      id: '1',
      timesPerMonth: 12, // Current frequency
      effectiveDate: '2024-06-01',
      history: [
        {
          timesPerMonth: 4, // Original
          effectiveDate: null,
        },
        {
          timesPerMonth: 8, // Second version
          effectiveDate: '2024-03-01',
        }
      ]
    };

    // Original period
    expect(getAssignmentFrequencyAtDate(assignment, '2024-01-15')).toBe(4);
    expect(getAssignmentFrequencyAtDate(assignment, '2024-02-28')).toBe(4);

    // Second version period
    expect(getAssignmentFrequencyAtDate(assignment, '2024-03-01')).toBe(8);
    expect(getAssignmentFrequencyAtDate(assignment, '2024-05-31')).toBe(8);

    // Current version
    expect(getAssignmentFrequencyAtDate(assignment, '2024-06-01')).toBe(12);
    expect(getAssignmentFrequencyAtDate(assignment, '2024-12-31')).toBe(12);
  });

  test('getAssignmentFrequencyAtDate handles backward compatibility', () => {
    const assignment: Assignment = {
      id: '1',
      timesPerMonth: 8,
      effectiveDate: '2024-03-01',
      history: [
        {
          timesPerMonth: 4,
          effectiveDate: undefined, // Old data might have undefined
        }
      ]
    };

    // Should handle undefined same as null
    expect(getAssignmentFrequencyAtDate(assignment, '2024-01-15')).toBe(4);
    expect(getAssignmentFrequencyAtDate(assignment, '2024-03-01')).toBe(8);
  });
});

describe('Edge Cases and Complex Scenarios', () => {
  test('handles chore with only future effective date correctly', () => {
    const chore: Chore = {
      id: '1',
      name: 'Future Chore',
      minutes: 30,
      effectiveDate: '2025-01-01',
      history: [
        {
          minutes: 20,
          effectiveDate: null,
        }
      ]
    };

    // All dates before 2025 should use the historical value
    expect(getChoreMinutesAtDate(chore, '2024-12-31')).toBe(20);
    expect(getChoreMinutesAtDate(chore, '2025-01-01')).toBe(30);
  });

  test('handles complex history with gaps correctly', () => {
    const chore: Chore = {
      id: '1',
      name: 'Complex Chore',
      minutes: 50,
      effectiveDate: '2024-09-01',
      history: [
        {
          minutes: 10,
          effectiveDate: null,
        },
        {
          minutes: 20,
          effectiveDate: '2024-02-01',
        },
        {
          minutes: 30,
          effectiveDate: '2024-05-01',
        },
        {
          minutes: 40,
          effectiveDate: '2024-07-01',
        }
      ]
    };

    expect(getChoreMinutesAtDate(chore, '2024-01-15')).toBe(10); // Original
    expect(getChoreMinutesAtDate(chore, '2024-02-15')).toBe(20); // Feb version
    expect(getChoreMinutesAtDate(chore, '2024-05-15')).toBe(30); // May version
    expect(getChoreMinutesAtDate(chore, '2024-07-15')).toBe(40); // July version
    expect(getChoreMinutesAtDate(chore, '2024-09-15')).toBe(50); // Current
  });

  test('preserves immutability of history', () => {
    const chore: Chore = {
      id: '1',
      name: 'Test Chore',
      minutes: 30,
      effectiveDate: '2024-03-01',
      history: [
        {
          minutes: 20,
          effectiveDate: null,
        }
      ]
    };

    const originalHistory = [...chore.history];

    // Multiple calls shouldn't mutate the history
    getChoreMinutesAtDate(chore, '2024-01-15');
    getChoreMinutesAtDate(chore, '2024-03-15');
    getChoreMinutesAtDate(chore, '2024-06-15');

    expect(chore.history).toEqual(originalHistory);
  });
});