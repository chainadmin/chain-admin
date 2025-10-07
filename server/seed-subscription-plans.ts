import { db } from './db';
import { subscriptionPlans } from '../shared/schema';
import { eq } from 'drizzle-orm';

async function seedSubscriptionPlans() {
  console.log('Seeding subscription plans...');

  const plans = [
    {
      name: 'Launch',
      slug: 'launch',
      monthlyPriceCents: 32500, // $325
      setupFeeCents: 10000, // $100
      includedEmails: 10000,
      includedSms: 1000,
      emailOverageRatePer1000: 250, // $2.50 per 1000
      smsOverageRatePerSegment: 3, // $0.03 per segment
      displayOrder: 1,
      isActive: true,
      features: JSON.stringify([
        'Up to 500 consumer accounts',
        '10,000 emails/month included',
        '1,000 SMS segments/month included',
        'Basic reporting',
        'Email support'
      ])
    },
    {
      name: 'Growth',
      slug: 'growth',
      monthlyPriceCents: 52500, // $525
      setupFeeCents: 10000, // $100
      includedEmails: 25000,
      includedSms: 3000,
      emailOverageRatePer1000: 250, // $2.50 per 1000
      smsOverageRatePerSegment: 3, // $0.03 per segment
      displayOrder: 2,
      isActive: true,
      features: JSON.stringify([
        'Up to 2,000 consumer accounts',
        '25,000 emails/month included',
        '3,000 SMS segments/month included',
        'Advanced reporting & analytics',
        'Priority email support',
        'Custom email templates'
      ])
    },
    {
      name: 'Pro',
      slug: 'pro',
      monthlyPriceCents: 100000, // $1,000
      setupFeeCents: 10000, // $100
      includedEmails: 75000,
      includedSms: 10000,
      emailOverageRatePer1000: 250, // $2.50 per 1000
      smsOverageRatePerSegment: 3, // $0.03 per segment
      displayOrder: 3,
      isActive: true,
      features: JSON.stringify([
        'Up to 10,000 consumer accounts',
        '75,000 emails/month included',
        '10,000 SMS segments/month included',
        'Full analytics suite',
        'Priority phone & email support',
        'Custom branding',
        'API access',
        'SMAX integration'
      ])
    },
    {
      name: 'Enterprise',
      slug: 'enterprise',
      monthlyPriceCents: 200000, // $2,000
      setupFeeCents: 0, // No setup fee for enterprise
      includedEmails: 200000,
      includedSms: 30000,
      emailOverageRatePer1000: 250, // $2.50 per 1000
      smsOverageRatePerSegment: 3, // $0.03 per segment
      displayOrder: 4,
      isActive: true,
      features: JSON.stringify([
        'Unlimited consumer accounts',
        '200,000 emails/month included',
        '30,000 SMS segments/month included',
        'Enterprise analytics & reporting',
        'Dedicated account manager',
        'Custom integrations',
        'White-label options',
        'SLA guarantee',
        '24/7 support'
      ])
    }
  ];

  try {
    for (const plan of plans) {
      // Check if plan already exists
      const existing = await db
        .select()
        .from(subscriptionPlans)
        .where(eq(subscriptionPlans.slug, plan.slug))
        .limit(1);

      if (existing.length === 0) {
        await db.insert(subscriptionPlans).values(plan);
        console.log(`✅ Created plan: ${plan.name}`);
      } else {
        console.log(`⏭️  Plan already exists: ${plan.name}`);
      }
    }

    console.log('✅ Subscription plans seeded successfully!');
  } catch (error) {
    console.error('❌ Error seeding subscription plans:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  seedSubscriptionPlans()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { seedSubscriptionPlans };
