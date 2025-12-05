import express from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { runMigrations } from "./migrations";
import cron from "node-cron";

const app = express();

async function createServer() {
  const server = await registerRoutes(app);

  const isProduction = process.env.NODE_ENV === "production";
  if (isProduction) {
    serveStatic(app);
  } else {
    await setupVite(app, server);
  }

  return server;
}

// Main function to start the server
async function main() {
  // Validate required environment variables at startup
  const requiredEnvVars = [
    'POSTMARK_SERVER_TOKEN',
    'DATABASE_URL',
    'JWT_SECRET'
  ];
  
  const missing = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missing.length > 0) {
    console.error('❌ STARTUP FAILED - Missing required environment variables:');
    missing.forEach(varName => console.error(`   - ${varName}`));
    console.error('\nThe application cannot start without these variables.');
    process.exit(1);
  }
  
  // Optional but recommended
  if (!process.env.POSTMARK_ACCOUNT_TOKEN) {
    console.warn('⚠️  POSTMARK_ACCOUNT_TOKEN not set - Admin features for creating Postmark servers will be disabled');
  }
  
  console.log('✅ All required environment variables are present');
  
  // Run database migrations automatically on startup (Railway deployments)
  await runMigrations();
  
  const server = await createServer();
  const PORT = Number(process.env.PORT) || 5000;
  server.listen(PORT, "0.0.0.0", () => {
    log(`serving on port ${PORT}`);
    
    // Set up scheduled tasks (cron jobs)
    setupScheduledTasks(PORT);
  });
}

// Setup scheduled tasks (cron jobs)
function setupScheduledTasks(port: number) {
  const baseUrl = `http://localhost:${port}`;
  
  // Process scheduled payments daily at 8:00 AM Eastern Time
  // Using timezone-aware cron to handle DST automatically
  cron.schedule('0 8 * * *', async () => {
    console.log('🕒 [CRON] Running scheduled payment processor at 8 AM ET...');
    try {
      const response = await fetch(`${baseUrl}/api/payments/process-scheduled`, {
        method: 'POST'
      });
      const result = await response.json();
      console.log('✅ [CRON] Payment processing complete:', result);
    } catch (error) {
      console.error('❌ [CRON] Payment processing failed:', error);
    }
  }, {
    timezone: 'America/New_York'
  });
  
  // Process automations every 15 minutes
  cron.schedule('*/15 * * * *', async () => {
    console.log('🕒 [CRON] Running automation processor...');
    try {
      const response = await fetch(`${baseUrl}/api/automations/process`, {
        method: 'POST'
      });
      const result = await response.json();
      console.log('✅ [CRON] Automation processing complete:', result);
    } catch (error) {
      console.error('❌ [CRON] Automation processing failed:', error);
    }
  });
  
  // Process subscription renewals daily at 12:00 AM ET
  cron.schedule('0 0 * * *', async () => {
    console.log('🕒 [CRON] Running subscription renewal processor...');
    try {
      const response = await fetch(`${baseUrl}/api/billing/process-renewals`, {
        method: 'POST'
      });
      const result = await response.json();
      console.log('✅ [CRON] Subscription renewal processing complete:', result);
    } catch (error) {
      console.error('❌ [CRON] Subscription renewal processing failed:', error);
    }
  }, {
    timezone: 'America/New_York'
  });
  
  // Generate monthly invoices on the 1st of each month at 12:00 AM ET
  cron.schedule('0 0 1 * *', async () => {
    console.log('🕒 [CRON] Running monthly invoice generator...');
    try {
      const response = await fetch(`${baseUrl}/api/billing/generate-monthly-invoices`, {
        method: 'POST'
      });
      const result = await response.json();
      console.log('✅ [CRON] Monthly invoice generation complete:', result);
    } catch (error) {
      console.error('❌ [CRON] Monthly invoice generation failed:', error);
    }
  }, {
    timezone: 'America/New_York'
  });
  
  // Delete expired returned accounts daily at 2:00 AM ET
  cron.schedule('0 2 * * *', async () => {
    console.log('🕒 [CRON] Running returned accounts cleanup...');
    try {
      const response = await fetch(`${baseUrl}/api/accounts/cleanup-returned`, {
        method: 'POST'
      });
      const result = await response.json();
      console.log('✅ [CRON] Returned accounts cleanup complete:', result);
    } catch (error) {
      console.error('❌ [CRON] Returned accounts cleanup failed:', error);
    }
  }, {
    timezone: 'America/New_York'
  });
  
  console.log('⏰ Scheduled tasks configured:');
  console.log('   - Payment processor: Daily at 8:00 AM ET (America/New_York timezone)');
  console.log('   - Automation processor: Every 15 minutes');
  console.log('   - Subscription renewal processor: Daily at 12:00 AM ET (America/New_York timezone)');
  console.log('   - Monthly invoice generator: 1st of each month at 12:00 AM ET (America/New_York timezone)');
  console.log('   - Returned accounts cleanup: Daily at 2:00 AM ET (America/New_York timezone)');
}

// Start the server in both development and production
main();