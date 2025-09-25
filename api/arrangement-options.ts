import { VercelRequest, VercelResponse } from '@vercel/node';
import jwt from 'jsonwebtoken';
import { getDb } from './_lib/db.js';
import { arrangementOptions, arrangementPlanTypes } from './_lib/schema.js';
import { eq, and } from 'drizzle-orm';
import { JWT_SECRET } from './_lib/auth.js';

interface AuthenticatedRequest extends VercelRequest {
  method: string;
}

async function handler(req: AuthenticatedRequest, res: VercelResponse) {
  const method = (req.method ?? '').toUpperCase();

  if (method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const db = await getDb();

    const planTypeSet = new Set(arrangementPlanTypes);

    const parseCurrencyInput = (value: any): number | null => {
      if (value === null || value === undefined) {
        return null;
      }

      if (typeof value === 'number') {
        if (!Number.isFinite(value)) {
          return null;
        }
        return Math.round(value);
      }

      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) {
          return null;
        }
        const numeric = Number(trimmed);
        if (Number.isNaN(numeric)) {
          return null;
        }
        if (trimmed.includes('.')) {
          return Math.round(numeric * 100);
        }
        return Math.round(numeric);
      }

      return null;
    };

    const parseOptionalInteger = (value: any): number | null => {
      if (value === null || value === undefined || value === '') {
        return null;
      }

      if (typeof value === 'number') {
        if (!Number.isFinite(value)) {
          return null;
        }
        return Math.trunc(value);
      }

      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) {
          return null;
        }
        const numeric = Number(trimmed);
        if (Number.isNaN(numeric)) {
          return null;
        }
        return Math.trunc(numeric);
      }

      return null;
    };

    const parsePercentageInput = (value: any): number | null => {
      if (value === null || value === undefined || value === '') {
        return null;
      }

      if (typeof value === 'number') {
        if (!Number.isFinite(value)) {
          return null;
        }
        if (value > 100 && value <= 10000 && Number.isInteger(value)) {
          return Math.trunc(value);
        }
        return Math.round(value * 100);
      }

      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) {
          return null;
        }
        const numeric = Number(trimmed.replace(/%$/, ''));
        if (Number.isNaN(numeric)) {
          return null;
        }
        return Math.round(numeric * 100);
      }

      return null;
    };

    const parseDateInput = (value: any): string | null => {
      if (typeof value !== 'string') {
        return null;
      }

      const trimmed = value.trim();
      if (!trimmed) {
        return null;
      }

      if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        return null;
      }

      const parsed = new Date(trimmed);
      if (Number.isNaN(parsed.getTime())) {
        return null;
      }

      return trimmed;
    };

    // Get tenant ID from JWT token
    const token = req.headers.authorization?.replace('Bearer ', '') || 
                  req.headers.cookie?.split(';').find(c => c.trim().startsWith('authToken='))?.split('=')[1];
    
    if (!token) {
      res.status(401).json({ error: 'No token provided' });
      return;
    }

    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const tenantId = decoded.tenantId;

    if (!tenantId) {
      res.status(403).json({ error: 'No tenant access' });
      return;
    }

    if (method === 'GET') {
      // Get all arrangement options for the tenant
      const options = await db
        .select()
        .from(arrangementOptions)
        .where(eq(arrangementOptions.tenantId, tenantId));

      res.status(200).json(options);
    } else if (method === 'POST') {
      // Create a new arrangement option
      const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
      const planTypeRaw = typeof req.body.planType === 'string' ? req.body.planType : 'range';
      const planType = planTypeSet.has(planTypeRaw as any) ? planTypeRaw : 'range';
      const minBalanceCents = parseCurrencyInput(req.body.minBalance);
      const maxBalanceCents = parseCurrencyInput(req.body.maxBalance);

      if (!name || minBalanceCents === null || maxBalanceCents === null) {
        res.status(400).json({ error: 'Missing required fields' });
        return;
      }

      if (minBalanceCents > maxBalanceCents) {
        res.status(400).json({ error: 'Minimum balance cannot be greater than maximum balance' });
        return;
      }

      const monthlyPaymentMinCents = parseCurrencyInput(req.body.monthlyPaymentMin);
      const monthlyPaymentMaxCents = parseCurrencyInput(req.body.monthlyPaymentMax);
      const fixedMonthlyPaymentCents = parseCurrencyInput(req.body.fixedMonthlyPayment ?? req.body.fixedMonthlyAmount);
      const payInFullAmountCents = parseCurrencyInput(req.body.payInFullAmount ?? req.body.payoffAmount);
      const payoffPercentageBasisPoints = parsePercentageInput(
        req.body.payoffPercentageBasisPoints ?? req.body.payoffPercentage ?? req.body.payoffPercent
      );
      const payoffDueDate = parseDateInput(req.body.payoffDueDate);
      const payoffText = typeof req.body.payoffText === 'string' ? req.body.payoffText.trim() : (typeof req.body.payInFullText === 'string' ? req.body.payInFullText.trim() : null);
      const customTermsText = typeof req.body.customTermsText === 'string' ? req.body.customTermsText.trim() : (typeof req.body.customCopy === 'string' ? req.body.customCopy.trim() : null);
      const maxTermMonths = parseOptionalInteger(req.body.maxTermMonths);
      const description = typeof req.body.description === 'string' ? req.body.description.trim() : null;

      if (planType === 'range') {
        if (monthlyPaymentMinCents === null || monthlyPaymentMaxCents === null) {
          res.status(400).json({ error: 'Monthly payment range is required for range plans' });
          return;
        }

        if (monthlyPaymentMinCents > monthlyPaymentMaxCents) {
          res.status(400).json({ error: 'Minimum payment cannot be greater than maximum payment' });
          return;
        }
      }

      if (planType === 'fixed_monthly' && fixedMonthlyPaymentCents === null) {
        res.status(400).json({ error: 'Monthly payment amount is required for fixed monthly plans' });
        return;
      }

      if (planType === 'pay_in_full') {
        if (payoffPercentageBasisPoints === null) {
          res.status(400).json({ error: 'Payoff percentage is required for pay in full plans' });
          return;
        }

        if (payoffPercentageBasisPoints <= 0 || payoffPercentageBasisPoints > 10000) {
          res.status(400).json({ error: 'Payoff percentage must be between 0 and 100' });
          return;
        }

        if (!payoffDueDate) {
          res.status(400).json({ error: 'Payoff due date is required for pay in full plans' });
          return;
        }
      }

      if (planType === 'custom_terms' && !customTermsText) {
        res.status(400).json({ error: 'Custom terms copy is required' });
        return;
      }

      const [newOption] = await db
        .insert(arrangementOptions)
        .values({
          tenantId,
          name,
          description,
          minBalance: minBalanceCents,
          maxBalance: maxBalanceCents,
          planType,
          monthlyPaymentMin: planType === 'range' ? monthlyPaymentMinCents : null,
          monthlyPaymentMax: planType === 'range' ? monthlyPaymentMaxCents : null,
          fixedMonthlyPayment: planType === 'fixed_monthly' ? fixedMonthlyPaymentCents : null,
          payInFullAmount: planType === 'pay_in_full' ? payInFullAmountCents : null,
          payoffText: planType === 'pay_in_full' ? payoffText : null,
          payoffPercentageBasisPoints: planType === 'pay_in_full' ? payoffPercentageBasisPoints : null,
          payoffDueDate: planType === 'pay_in_full' ? payoffDueDate : null,
          customTermsText: planType === 'custom_terms' ? customTermsText : null,
          maxTermMonths:
            planType === 'pay_in_full' || planType === 'custom_terms'
              ? null
              : planType === 'range'
                ? (maxTermMonths ?? 12)
                : maxTermMonths,
        })
        .returning();

      res.status(201).json(newOption);
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error: any) {
    console.error('Arrangement options API error:', error);
    res.status(500).json({ error: error.message });
  }
}

export default handler;