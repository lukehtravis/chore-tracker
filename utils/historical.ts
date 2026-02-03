// Historical calculation utilities for chore and assignment versioning

export interface ChoreHistory {
  minutes: number;
  effectiveDate: string | null | undefined;
  name?: string;
}

export interface Chore {
  id: string;
  name: string;
  minutes: number;
  effectiveDate?: string | null | undefined;
  history?: ChoreHistory[];
}

export interface AssignmentHistory {
  timesPerMonth: number;
  effectiveDate: string | null | undefined;
}

export interface Assignment {
  id: string;
  timesPerMonth: number;
  effectiveDate?: string | null | undefined;
  history?: AssignmentHistory[];
  personId?: string;
  choreId?: string;
  dayOfWeek?: number | null;
}

// Get the chore minutes that were effective on a given date
export const getChoreMinutesAtDate = (chore: Chore, date: string): number => {
  // If no versioning, return current minutes (backward compatible)
  if (!chore.effectiveDate && !chore.history) {
    return chore.minutes;
  }

  // Parse target date
  const targetDate = new Date(date + "T12:00:00");

  // Build complete version list (current + history)
  const allVersions = [
    { minutes: chore.minutes, effectiveDate: chore.effectiveDate },
    ...(chore.history || [])
  ];

  // Sort by effectiveDate descending (newest first), nulls last (oldest)
  const sorted = allVersions.sort((a, b) => {
    if (!a.effectiveDate) return 1;
    if (!b.effectiveDate) return -1;
    return new Date(b.effectiveDate + "T12:00:00").getTime() -
           new Date(a.effectiveDate + "T12:00:00").getTime();
  });

  // Find first version where target >= effectiveDate
  for (const version of sorted) {
    if (!version.effectiveDate) {
      // No effectiveDate means "since beginning of time"
      return version.minutes;
    }
    const versionDate = new Date(version.effectiveDate + "T12:00:00");
    if (targetDate >= versionDate) {
      return version.minutes;
    }
  }

  // Target date is before ALL versions → use oldest value
  // This handles the case where target date is earlier than earliest effectiveDate
  const oldest = sorted[sorted.length - 1];
  return oldest.minutes;
};

// Get the chore name that was effective on a given date
export const getChoreNameAtDate = (chore: Chore, date: string): string => {
  // If no versioning, return current name (backward compatible)
  if (!chore.effectiveDate && !chore.history) {
    return chore.name;
  }

  // Parse target date
  const targetDate = new Date(date + "T12:00:00");

  // Build complete version list (current + history with names)
  const allVersions = [
    { name: chore.name, effectiveDate: chore.effectiveDate },
    ...(chore.history || []).filter(h => h.name) // Only include history entries that changed the name
  ];

  // Sort by effectiveDate descending (newest first), nulls last (oldest)
  const sorted = allVersions.sort((a, b) => {
    if (!a.effectiveDate) return 1;
    if (!b.effectiveDate) return -1;
    return new Date(b.effectiveDate + "T12:00:00").getTime() -
           new Date(a.effectiveDate + "T12:00:00").getTime();
  });

  // Find first version where target >= effectiveDate
  for (const version of sorted) {
    if (!version.effectiveDate) {
      // No effectiveDate means "since beginning of time"
      return version.name;
    }
    const versionDate = new Date(version.effectiveDate + "T12:00:00");
    if (targetDate >= versionDate) {
      return version.name;
    }
  }

  // Target date is before ALL versions → use oldest value
  const oldest = sorted[sorted.length - 1];
  return oldest.name;
};

// Get the assignment frequency that was effective on a given date
export const getAssignmentFrequencyAtDate = (assignment: Assignment, date: string): number => {
  // If no versioning, return current frequency (backward compatible)
  if (!assignment.effectiveDate && !assignment.history) {
    return assignment.timesPerMonth;
  }

  // Parse target date
  const targetDate = new Date(date + "T12:00:00");

  // Build complete version list (current + history)
  const allVersions = [
    { timesPerMonth: assignment.timesPerMonth, effectiveDate: assignment.effectiveDate },
    ...(assignment.history || [])
  ];

  // Sort by effectiveDate descending (newest first), nulls last (oldest)
  const sorted = allVersions.sort((a, b) => {
    if (!a.effectiveDate) return 1;
    if (!b.effectiveDate) return -1;
    return new Date(b.effectiveDate + "T12:00:00").getTime() -
           new Date(a.effectiveDate + "T12:00:00").getTime();
  });

  // Find first version where target >= effectiveDate
  for (const version of sorted) {
    if (!version.effectiveDate) {
      // No effectiveDate means "since beginning of time"
      return version.timesPerMonth;
    }
    const versionDate = new Date(version.effectiveDate + "T12:00:00");
    if (targetDate >= versionDate) {
      return version.timesPerMonth;
    }
  }

  // Target date is before ALL versions → use oldest value
  const oldest = sorted[sorted.length - 1];
  return oldest.timesPerMonth;
};