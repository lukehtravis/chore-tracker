import { describe, test, expect } from '@jest/globals';
import {
  planCompletionDeletion,
  isMonthLocked,
  type DeletionCompletion,
  type DeletionDebt,
  type DeletionDebtPayment,
} from './completionDeletion';

describe('planCompletionDeletion', () => {
  test('plain self-completion: only deletes the completion', () => {
    const completion: DeletionCompletion = { id: 'c1' };
    const plan = planCompletionDeletion(completion, [], [], [completion]);
    expect(plan.deleteCompletionIds).toEqual(['c1']);
    expect(plan.deleteDebtIds).toEqual([]);
    expect(plan.deleteDebtPaymentIds).toEqual([]);
    expect(plan.updateDebts).toEqual([]);
    expect(plan.markProvisionalCompletionIds).toEqual([]);
    expect(plan.touchesFeeCalculatedDebt).toBe(false);
  });

  test('completion that CREATED a debt removes the debt and its payments', () => {
    const completion: DeletionCompletion = {
      id: 'c1',
      isProvisional: true,
      sourceDebtId: 'd1',
    };
    const debts: DeletionDebt[] = [
      { id: 'd1', remainingMinutes: 20, sourceCompletionId: 'c1' },
    ];
    const payments: DeletionDebtPayment[] = [
      { id: 'p1', debtId: 'd1', completionId: 'cOther', minutesApplied: 5 },
    ];
    const plan = planCompletionDeletion(completion, debts, payments, [completion]);
    expect(plan.deleteCompletionIds).toEqual(['c1']);
    expect(plan.deleteDebtIds).toEqual(['d1']);
    expect(plan.deleteDebtPaymentIds).toEqual(['p1']);
    expect(plan.updateDebts).toEqual([]);
  });

  test('completion that PAID a debt restores remaining and re-flags source', () => {
    // d1 originated from cSrc (provisional). c1 fully paid it -> remaining 0,
    // cSrc flipped permanent. Deleting c1 must restore 20 and re-provisionalize cSrc.
    const cSrc: DeletionCompletion = { id: 'cSrc', isProvisional: false, sourceDebtId: 'd1' };
    const c1: DeletionCompletion = { id: 'c1' };
    const debts: DeletionDebt[] = [
      { id: 'd1', remainingMinutes: 0, originalMinutes: 20, sourceCompletionId: 'cSrc' },
    ];
    const payments: DeletionDebtPayment[] = [
      { id: 'p1', debtId: 'd1', completionId: 'c1', minutesApplied: 20 },
    ];
    const plan = planCompletionDeletion(c1, debts, payments, [cSrc, c1]);
    expect(plan.deleteCompletionIds).toEqual(['c1']);
    expect(plan.deleteDebtPaymentIds).toEqual(['p1']);
    expect(plan.updateDebts).toEqual([{ id: 'd1', remainingMinutes: 20 }]);
    expect(plan.markProvisionalCompletionIds).toEqual(['cSrc']);
  });

  test('partial payment restores to a still-open balance and re-flags source', () => {
    const cSrc: DeletionCompletion = { id: 'cSrc', isProvisional: true, sourceDebtId: 'd1' };
    const c1: DeletionCompletion = { id: 'c1' };
    const debts: DeletionDebt[] = [
      { id: 'd1', remainingMinutes: 10, originalMinutes: 20, sourceCompletionId: 'cSrc' },
    ];
    const payments: DeletionDebtPayment[] = [
      { id: 'p1', debtId: 'd1', completionId: 'c1', minutesApplied: 10 },
    ];
    const plan = planCompletionDeletion(c1, debts, payments, [cSrc, c1]);
    expect(plan.updateDebts).toEqual([{ id: 'd1', remainingMinutes: 20 }]);
    expect(plan.markProvisionalCompletionIds).toEqual(['cSrc']);
  });

  test('multiple payments by same completion to same debt sum correctly', () => {
    const c1: DeletionCompletion = { id: 'c1' };
    const debts: DeletionDebt[] = [
      { id: 'd1', remainingMinutes: 0, originalMinutes: 30, sourceCompletionId: 'cSrc' },
    ];
    const payments: DeletionDebtPayment[] = [
      { id: 'p1', debtId: 'd1', completionId: 'c1', minutesApplied: 10 },
      { id: 'p2', debtId: 'd1', completionId: 'c1', minutesApplied: 20 },
    ];
    const plan = planCompletionDeletion(c1, debts, payments, [c1]);
    expect(plan.updateDebts).toEqual([{ id: 'd1', remainingMinutes: 30 }]);
    expect(plan.deleteDebtPaymentIds.sort()).toEqual(['p1', 'p2']);
  });

  test('flags when a touched debt already had its fee calculated', () => {
    const c1: DeletionCompletion = { id: 'c1' };
    const debts: DeletionDebt[] = [
      { id: 'd1', remainingMinutes: 5, sourceCompletionId: 'cSrc', feeCalculated: true },
    ];
    const payments: DeletionDebtPayment[] = [
      { id: 'p1', debtId: 'd1', completionId: 'c1', minutesApplied: 5 },
    ];
    const plan = planCompletionDeletion(c1, debts, payments, [c1]);
    expect(plan.touchesFeeCalculatedDebt).toBe(true);
  });

  test('does not restore a debt that is itself being deleted', () => {
    // Contrived: completion both created d1 and had a payment row against d1.
    const c1: DeletionCompletion = { id: 'c1', sourceDebtId: 'd1' };
    const debts: DeletionDebt[] = [
      { id: 'd1', remainingMinutes: 0, sourceCompletionId: 'c1' },
    ];
    const payments: DeletionDebtPayment[] = [
      { id: 'p1', debtId: 'd1', completionId: 'c1', minutesApplied: 5 },
    ];
    const plan = planCompletionDeletion(c1, debts, payments, [c1]);
    expect(plan.deleteDebtIds).toEqual(['d1']);
    expect(plan.updateDebts).toEqual([]);
    expect(plan.deleteDebtPaymentIds).toEqual(['p1']);
  });
});

describe('isMonthLocked', () => {
  test('no fees for the month -> not locked', () => {
    expect(isMonthLocked('2026-01', [])).toBe(false);
    expect(isMonthLocked('2026-01', [{ monthKey: '2026-02', processed: true }])).toBe(false);
  });

  test('some unprocessed -> not locked', () => {
    expect(
      isMonthLocked('2026-01', [
        { monthKey: '2026-01', processed: true },
        { monthKey: '2026-01', processed: false },
      ])
    ).toBe(false);
  });

  test('all processed -> locked', () => {
    expect(
      isMonthLocked('2026-01', [
        { monthKey: '2026-01', processed: true },
        { monthKey: '2026-01', processed: true },
      ])
    ).toBe(true);
  });
});
