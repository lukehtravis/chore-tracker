// Pure planning logic for deleting a completion and cleaning up any debts,
// debt payments, and provisional flags that were coupled to it.
//
// Kept side-effect-free so it can be unit tested. The App component executes
// the returned plan against Firestore (deleteDoc / updateDoc).
//
// Coupling rules this mirrors (see App.tsx record + debt logic):
//  - A cross-person completion can CREATE a debt: the debt's
//    `sourceCompletionId` points back at the (provisional) completion.
//  - A completion can PAY existing debts: a `debtPayments` row links the
//    paying completion to the debt via `completionId` / `debtId`, and reduces
//    the debt's `remainingMinutes`. When a debt hit zero, its own source
//    completion was flipped from provisional to permanent.

export interface DeletionCompletion {
  id: string;
  isProvisional?: boolean;
  sourceDebtId?: string | null;
}

export interface DeletionDebt {
  id: string;
  remainingMinutes?: number | null;
  originalMinutes?: number | null;
  sourceCompletionId?: string | null;
  expiredAt?: string | null;
  feeCalculated?: boolean;
}

export interface DeletionDebtPayment {
  id: string;
  debtId: string;
  completionId: string;
  minutesApplied?: number | null;
}

export interface DeletionPlan {
  // Completion docs to delete (always includes the target completion).
  deleteCompletionIds: string[];
  // Debt docs to delete (debts this completion created).
  deleteDebtIds: string[];
  // debtPayment docs to delete (payments this completion made, plus any
  // payments against a debt we're deleting).
  deleteDebtPaymentIds: string[];
  // Debts whose remainingMinutes must be restored because this completion's
  // payments are being reversed. Keyed updates.
  updateDebts: Array<{ id: string; remainingMinutes: number }>;
  // Completion docs to re-flag as provisional because a debt they originated
  // is being reopened (was fully paid, now isn't).
  markProvisionalCompletionIds: string[];
  // True if any debt touched here already had its expired-debt fee calculated.
  // The caller may warn the user, since reversing it can affect a past fee.
  touchesFeeCalculatedDebt: boolean;
}

const uniq = (arr: string[]): string[] => Array.from(new Set(arr));

export function planCompletionDeletion(
  completion: DeletionCompletion,
  debts: DeletionDebt[],
  debtPayments: DeletionDebtPayment[],
  completions: DeletionCompletion[]
): DeletionPlan {
  const deleteCompletionIds = [completion.id];
  const deleteDebtIds: string[] = [];
  const deleteDebtPaymentIds: string[] = [];
  const markProvisionalCompletionIds: string[] = [];
  // Accumulate restored minutes per debt so multiple payments sum correctly.
  const restoreByDebt = new Map<string, number>();
  let touchesFeeCalculatedDebt = false;

  // --- Case A: this completion CREATED one or more debts ---
  const createdDebts = debts.filter(
    (d) => d.sourceCompletionId === completion.id
  );
  for (const d of createdDebts) {
    deleteDebtIds.push(d.id);
    if (d.feeCalculated) touchesFeeCalculatedDebt = true;
    // Any payments made against a debt we're removing are now meaningless.
    for (const p of debtPayments) {
      if (p.debtId === d.id) deleteDebtPaymentIds.push(p.id);
    }
  }

  // --- Case B: this completion PAID one or more debts ---
  const paymentsByThis = debtPayments.filter(
    (p) => p.completionId === completion.id
  );
  for (const p of paymentsByThis) {
    deleteDebtPaymentIds.push(p.id);
    const debt = debts.find((d) => d.id === p.debtId);
    // If the debt itself is being deleted (Case A), no need to restore it.
    if (!debt || deleteDebtIds.includes(debt.id)) continue;
    if (debt.feeCalculated) touchesFeeCalculatedDebt = true;
    const prior = restoreByDebt.get(debt.id);
    const base = prior ?? debt.remainingMinutes ?? 0;
    restoreByDebt.set(debt.id, base + (p.minutesApplied ?? 0));
  }

  const updateDebts: Array<{ id: string; remainingMinutes: number }> = [];
  for (const [debtId, remainingMinutes] of restoreByDebt) {
    updateDebts.push({ id: debtId, remainingMinutes });
    // Reopening a debt (remaining now > 0) means its originating completion is
    // once again provisional (it was only permanent because the debt was paid).
    if (remainingMinutes > 0) {
      const debt = debts.find((d) => d.id === debtId);
      const source = debt
        ? completions.find((c) => c.id === debt.sourceCompletionId)
        : undefined;
      // Only re-flag genuine provisional-origin completions, and never the one
      // we're deleting.
      if (
        source &&
        source.id !== completion.id &&
        source.sourceDebtId === debtId
      ) {
        markProvisionalCompletionIds.push(source.id);
      }
    }
  }

  return {
    deleteCompletionIds: uniq(deleteCompletionIds),
    deleteDebtIds: uniq(deleteDebtIds),
    deleteDebtPaymentIds: uniq(deleteDebtPaymentIds),
    updateDebts,
    markProvisionalCompletionIds: uniq(markProvisionalCompletionIds),
    touchesFeeCalculatedDebt,
  };
}

// Whether a calendar month (YYYY-MM) is "finalized": it has at least one
// monthlyFee record and every monthlyFee for that month is processed. Deleting
// (and adding) completions in a finalized month is blocked.
export interface MonthlyFeeLike {
  monthKey: string;
  processed?: boolean;
}

export function isMonthLocked(
  monthKey: string,
  monthlyFees: MonthlyFeeLike[]
): boolean {
  const feesForMonth = monthlyFees.filter((f) => f.monthKey === monthKey);
  if (feesForMonth.length === 0) return false;
  return feesForMonth.every((f) => !!f.processed);
}
