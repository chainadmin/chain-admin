export interface ArrangementLike {
  planType?: string | null;
  monthlyPaymentMin?: number | null;
  monthlyPaymentMax?: number | null;
  fixedMonthlyPayment?: number | null;
  payInFullAmount?: number | null;
  payoffText?: string | null;
  customTermsText?: string | null;
  maxTermMonths?: number | null;
}

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
});

export const formatCurrencyFromCents = (value?: number | null): string => {
  if (value === null || value === undefined) {
    return '';
  }

  return currencyFormatter.format(value / 100);
};

export const getPlanTypeLabel = (planType?: string | null): string => {
  switch (planType) {
    case 'fixed_monthly':
      return 'Fixed monthly';
    case 'pay_in_full':
      return 'Pay in full';
    case 'custom_terms':
      return 'Custom terms';
    case 'range':
    case undefined:
    case null:
      return 'Range';
    default:
      return planType as string;
  }
};

export const getArrangementSummary = (arrangement: ArrangementLike) => {
  const planType = arrangement.planType ?? 'range';
  const maxTerm = typeof arrangement.maxTermMonths === 'number' && arrangement.maxTermMonths > 0
    ? arrangement.maxTermMonths
    : null;

  switch (planType) {
    case 'range': {
      const min = typeof arrangement.monthlyPaymentMin === 'number' ? arrangement.monthlyPaymentMin : null;
      const max = typeof arrangement.monthlyPaymentMax === 'number' ? arrangement.monthlyPaymentMax : null;
      let headline = '';
      if (min !== null && max !== null) {
        headline = `${formatCurrencyFromCents(min)} - ${formatCurrencyFromCents(max)} per month`;
      } else if (min !== null) {
        headline = `${formatCurrencyFromCents(min)} per month`;
      } else if (max !== null) {
        headline = `${formatCurrencyFromCents(max)} per month`;
      } else {
        headline = 'Monthly payment plan';
      }

      const detail = maxTerm ? `Up to ${maxTerm} months` : undefined;
      return { planType, headline, detail };
    }
    case 'fixed_monthly': {
      const amount = typeof arrangement.fixedMonthlyPayment === 'number' ? arrangement.fixedMonthlyPayment : null;
      const headline = amount !== null
        ? `${formatCurrencyFromCents(amount)} per month`
        : 'Fixed monthly payment';
      const detail = maxTerm ? `Up to ${maxTerm} months` : 'Until paid in full';
      return { planType, headline, detail };
    }
    case 'pay_in_full': {
      const amount = typeof arrangement.payInFullAmount === 'number' ? arrangement.payInFullAmount : null;
      const payoffText = arrangement.payoffText?.trim();
      const headline = amount !== null
        ? `Pay ${formatCurrencyFromCents(amount)} today`
        : payoffText || 'Pay in full';
      const detail = amount !== null && payoffText ? payoffText : undefined;
      return { planType, headline, detail };
    }
    case 'custom_terms': {
      const customText = arrangement.customTermsText?.trim();
      return {
        planType,
        headline: customText || 'Contact us to discuss terms',
      };
    }
    default: {
      const min = typeof arrangement.monthlyPaymentMin === 'number' ? arrangement.monthlyPaymentMin : null;
      const max = typeof arrangement.monthlyPaymentMax === 'number' ? arrangement.monthlyPaymentMax : null;
      if (min !== null || max !== null) {
        return {
          planType,
          headline: `${formatCurrencyFromCents(min ?? max ?? 0)} - ${formatCurrencyFromCents(max ?? min ?? 0)} per month`,
          detail: maxTerm ? `Up to ${maxTerm} months` : undefined,
        };
      }
      return {
        planType,
        headline: 'Payment arrangement available',
      };
    }
  }
};
