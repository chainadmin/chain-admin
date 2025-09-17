import { VercelRequest, VercelResponse } from '@vercel/node';
import jwt from 'jsonwebtoken';
import { getDb } from './_lib/db';
import { arrangementOptions } from './_lib/schema';
import { eq, and } from 'drizzle-orm';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

interface AuthenticatedRequest extends VercelRequest {
  method: string;
}

async function handler(req: AuthenticatedRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const db = getDb();
    
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

    if (req.method === 'GET') {
      // Get all arrangement options for the tenant
      const options = await db
        .select()
        .from(arrangementOptions)
        .where(eq(arrangementOptions.tenantId, tenantId));

      res.status(200).json(options);
    } else if (req.method === 'POST') {
      // Create a new arrangement option
      const { 
        name, 
        description, 
        minBalance, 
        maxBalance, 
        monthlyPaymentMin, 
        monthlyPaymentMax, 
        maxTermMonths 
      } = req.body;

      if (!name || minBalance === undefined || maxBalance === undefined || 
          monthlyPaymentMin === undefined || monthlyPaymentMax === undefined) {
        res.status(400).json({ error: 'Missing required fields' });
        return;
      }

      // Convert dollar amounts to cents for storage
      const minBalanceCents = Math.round(parseFloat(minBalance) * 100);
      const maxBalanceCents = Math.round(parseFloat(maxBalance) * 100);
      const monthlyPaymentMinCents = Math.round(parseFloat(monthlyPaymentMin) * 100);
      const monthlyPaymentMaxCents = Math.round(parseFloat(monthlyPaymentMax) * 100);
      
      // Validate that all values are valid numbers
      if (isNaN(minBalanceCents) || isNaN(maxBalanceCents) || 
          isNaN(monthlyPaymentMinCents) || isNaN(monthlyPaymentMaxCents)) {
        res.status(400).json({ error: 'Invalid numeric values provided' });
        return;
      }
      
      // Validate logical constraints
      if (minBalanceCents > maxBalanceCents) {
        res.status(400).json({ error: 'Minimum balance cannot be greater than maximum balance' });
        return;
      }
      
      if (monthlyPaymentMinCents > monthlyPaymentMaxCents) {
        res.status(400).json({ error: 'Minimum payment cannot be greater than maximum payment' });
        return;
      }

      const [newOption] = await db
        .insert(arrangementOptions)
        .values({
          tenantId,
          name,
          description: description || null,
          minBalance: minBalanceCents,
          maxBalance: maxBalanceCents,
          monthlyPaymentMin: monthlyPaymentMinCents,
          monthlyPaymentMax: monthlyPaymentMaxCents,
          maxTermMonths: parseInt(maxTermMonths) || 12,
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