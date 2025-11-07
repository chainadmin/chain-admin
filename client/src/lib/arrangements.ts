export interface ArrangementLike {
  planType?: string | null;
  monthlyPaymentMin?: number | null;
  monthlyPaymentMax?: number | null;
  fixedMonthlyPayment?: number | null;
  payInFullAmount?: number | null;
  oneTimePaymentMin?: number | null;
  payoffText?: string | null;
  customTermsText?: string | null;
  maxTermMonths?: number | null;
  payoffPercentageBasisPoints?: number | null;
  payoffDueDate?: string | null;
  calculatedMonthlyPayment?: number | null;
  settlementPaymentCount?: number | null;
  settlementPaymentFrequency?: string | null;
}

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
});

const dateFormatter = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' });

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
    case 'settlement':
      return 'Settlement';
    case 'custom_terms':
      return 'Custom terms';
    case 'one_time_payment':
      return 'One-time payment';
    case 'range':
    case undefined:
    case null:
      return 'Range';
    default:
      return planType as string;
  }
};

export const calculateArrangementPayment = (
  arrangement: ArrangementLike,
  accountBalanceCents: number
): number => {
  const planType = arrangement.planType ?? 'range';

  switch (planType) {
    case 'settlement':
      if (arrangement.payoffPercentageBasisPoints) {
        return Math.round(accountBalanceCents * arrangement.payoffPercentageBasisPoints / 10000);
      }
      return accountBalanceCents;
    
    case 'fixed_monthly':
      return arrangement.fixedMonthlyPayment || accountBalanceCents;
    
    case 'range':
      return arrangement.monthlyPaymentMin || accountBalanceCents;
    
    case 'one_time_payment':
      return arrangement.oneTimePaymentMin || accountBalanceCents;
    
    case 'custom_terms':
      return accountBalanceCents;
    
    default:
      return accountBalanceCents;
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
    case 'settlement': {
      const settlementText = arrangement.payoffText?.trim();
      const percentageBasisPoints = typeof arrangement.payoffPercentageBasisPoints === 'number'
        ? arrangement.payoffPercentageBasisPoints
        : null;
      const dueDate = arrangement.payoffDueDate;
      const paymentCount = typeof arrangement.settlementPaymentCount === 'number' ? arrangement.settlementPaymentCount : null;
      const perPaymentAmount = typeof arrangement.calculatedMonthlyPayment === 'number' ? arrangement.calculatedMonthlyPayment : null;
      const frequency = arrangement.settlementPaymentFrequency;

      const formattedPercentage = percentageBasisPoints !== null
        ? (percentageBasisPoints / 100).toLocaleString('en-US', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2,
          }) + '%'
        : null;

      const formattedDueDate = dueDate
        ? (() => {
            const parsedDate = new Date(dueDate);
            return Number.isNaN(parsedDate.getTime()) ? null : dateFormatter.format(parsedDate);
          })()
        : null;

      // Build headline based on payment structure
      let headline = '';
      if (paymentCount && paymentCount === 1) {
        // Single payment settlement
        headline = formattedPercentage
          ? `Settle for ${formattedPercentage} - Pay in Full`
          : settlementText || 'Settlement offer - Pay in Full';
      } else if (paymentCount && perPaymentAmount) {
        // Multi-payment settlement
        const frequencyLabel = frequency === 'weekly' ? 'week' 
          : frequency === 'biweekly' ? 'bi-weekly' 
          : 'month';
        headline = formattedPercentage
          ? `Settle for ${formattedPercentage} - ${paymentCount} payments`
          : `Settlement - ${paymentCount} payments`;
      } else {
        // Default settlement display
        headline = formattedPercentage
          ? `Settle for ${formattedPercentage} of balance`
          : settlementText || 'Settlement offer';
      }

      const detailParts: string[] = [];
      
      // Add per-payment amount if multi-payment
      if (paymentCount && paymentCount > 1 && perPaymentAmount) {
        const frequencyLabel = frequency === 'weekly' ? 'weekly' 
          : frequency === 'biweekly' ? 'bi-weekly' 
          : 'monthly';
        detailParts.push(`${formatCurrencyFromCents(perPaymentAmount)} per payment (${frequencyLabel})`);
      }
      
      if (formattedDueDate) {
        detailParts.push(`Expires ${formattedDueDate}`);
      }

      const supplementalText = settlementText && settlementText !== headline ? settlementText : null;
      if (supplementalText) {
        detailParts.push(supplementalText);
      }

      return { planType, headline, detail: detailParts.length ? detailParts.join(' • ') : undefined };
    }
    case 'custom_terms': {
      const customText = arrangement.customTermsText?.trim();
      return {
        planType,
        headline: customText || 'Contact us to discuss terms',
      };
    }
    case 'one_time_payment': {
      const minAmount = typeof arrangement.oneTimePaymentMin === 'number' ? arrangement.oneTimePaymentMin : null;
      const headline = minAmount !== null
        ? `Minimum payment: ${formatCurrencyFromCents(minAmount)}`
        : 'One-time payment option';
      return {
        planType,
        headline,
        detail: 'Make a single payment without setting up a plan',
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
