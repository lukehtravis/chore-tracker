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

  // Check if current version was effective on this date
  // Handle null effectiveDate (meaning "since the beginning of time")
  if (chore.effectiveDate === null || chore.effectiveDate === undefined) {
    return chore.minutes; // Current version has always been effective
  }
  if (chore.effectiveDate) {
    const effectiveDate = new Date(chore.effectiveDate + "T12:00:00");
    if (targetDate >= effectiveDate) {
      return chore.minutes; // Current version applies
    }
  }

  // Search history for the version that was active on this date
  if (chore.history && chore.history.length > 0) {
    // Sort history by effectiveDate descending (newest first)
    // Null/undefined dates go to the end (oldest)
    const sortedHistory = [...chore.history].sort((a, b) => {
      if (a.effectiveDate === null || a.effectiveDate === undefined) return 1;
      if (b.effectiveDate === null || b.effectiveDate === undefined) return -1;
      return new Date(b.effectiveDate + "T12:00:00").getTime() -
             new Date(a.effectiveDate + "T12:00:00").getTime();
    });

    // Find the most recent version that was effective before or on target date
    for (const version of sortedHistory) {
      if (version.effectiveDate === null || version.effectiveDate === undefined) {
        return version.minutes; // This version has always been effective
      }
      const versionDate = new Date(version.effectiveDate + "T12:00:00");
      if (targetDate >= versionDate) {
        return version.minutes;
      }
    }
  }

  // Fallback: if no version found, use current minutes
  return chore.minutes;
};

// Get the chore name that was effective on a given date
export const getChoreNameAtDate = (chore: Chore, date: string): string => {
  // If no versioning, return current name (backward compatible)
  if (!chore.effectiveDate && !chore.history) {
    return chore.name;
  }

  // Parse target date
  const targetDate = new Date(date + "T12:00:00");

  // Check if current version was effective on this date
  // Handle null effectiveDate (meaning "since the beginning of time")
  if (chore.effectiveDate === null || chore.effectiveDate === undefined) {
    return chore.name; // Current version has always been effective
  }
  if (chore.effectiveDate) {
    const effectiveDate = new Date(chore.effectiveDate + "T12:00:00");
    if (targetDate >= effectiveDate) {
      return chore.name; // Current version applies
    }
  }

  // Search history for the version that was active on this date
  if (chore.history && chore.history.length > 0) {
    // Sort history by effectiveDate descending (newest first)
    // Null/undefined dates go to the end (oldest)
    const sortedHistory = [...chore.history].sort((a, b) => {
      if (a.effectiveDate === null || a.effectiveDate === undefined) return 1;
      if (b.effectiveDate === null || b.effectiveDate === undefined) return -1;
      return new Date(b.effectiveDate + "T12:00:00").getTime() -
             new Date(a.effectiveDate + "T12:00:00").getTime();
    });

    // Find the most recent version that was effective before or on target date
    for (const version of sortedHistory) {
      if (version.effectiveDate === null || version.effectiveDate === undefined) {
        // This version has always been effective
        return version.name !== undefined ? version.name : chore.name;
      }
      const versionDate = new Date(version.effectiveDate + "T12:00:00");
      if (targetDate >= versionDate) {
        // Return the name from history if stored, otherwise use current name
        return version.name !== undefined ? version.name : chore.name;
      }
    }
  }

  // Fallback: if no version found, use current name
  return chore.name;
};

// Get the assignment frequency that was effective on a given date
export const getAssignmentFrequencyAtDate = (assignment: Assignment, date: string): number => {
  // If no versioning, return current frequency (backward compatible)
  if (!assignment.effectiveDate && !assignment.history) {
    return assignment.timesPerMonth;
  }

  // Parse target date
  const targetDate = new Date(date + "T12:00:00");

  // Check if current version was effective on this date
  // Handle null effectiveDate (meaning "since the beginning of time")
  if (assignment.effectiveDate === null || assignment.effectiveDate === undefined) {
    return assignment.timesPerMonth; // Current version has always been effective
  }
  if (assignment.effectiveDate) {
    const effectiveDate = new Date(assignment.effectiveDate + "T12:00:00");
    if (targetDate >= effectiveDate) {
      return assignment.timesPerMonth; // Current version applies
    }
  }

  // Search history for the version that was active on this date
  if (assignment.history && assignment.history.length > 0) {
    // Sort history by effectiveDate descending (newest first)
    // Null/undefined dates go to the end (oldest)
    const sortedHistory = [...assignment.history].sort((a, b) => {
      if (a.effectiveDate === null || a.effectiveDate === undefined) return 1;
      if (b.effectiveDate === null || b.effectiveDate === undefined) return -1;
      return new Date(b.effectiveDate + "T12:00:00").getTime() -
             new Date(a.effectiveDate + "T12:00:00").getTime();
    });

    // Find the most recent version that was effective before or on target date
    for (const version of sortedHistory) {
      if (version.effectiveDate === null || version.effectiveDate === undefined) {
        return version.timesPerMonth; // This version has always been effective
      }
      const versionDate = new Date(version.effectiveDate + "T12:00:00");
      if (targetDate >= versionDate) {
        return version.timesPerMonth;
      }
    }
  }

  // Fallback: if no version found, use current frequency
  return assignment.timesPerMonth;
};