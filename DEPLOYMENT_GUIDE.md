# Vercel Deployment Guide

This guide will help you deploy your Chain application to Vercel with Supabase as the database.

## Prerequisites

1. **GitHub Repository**: Your code needs to be in a GitHub repository
2. **Vercel Account**: Sign up at https://vercel.com
3. **Supabase Database**: Your existing Supabase database URL

## Step 1: Push Code to GitHub

1. Create a new repository on GitHub
2. Push your code:
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin YOUR_GITHUB_REPO_URL
git push -u origin main
```

## Step 2: Deploy to Vercel

1. Go to https://vercel.com/dashboard
2. Click "Add New Project"
3. Import your GitHub repository
4. Configure the project:
   - **Framework Preset**: Vite
   - **Root Directory**: Leave as is (`.`)
   - **Build Command**: `npx vite build`
   - **Output Directory**: `dist/public`
   - **Install Command**: `npm install`

## Step 3: Configure Environment Variables

In Vercel project settings, add these environment variables:

```
DATABASE_URL=your_supabase_database_url
JWT_SECRET=generate-a-secure-random-string-here
NODE_ENV=production
```

Optional (if using email/SMS):
```
POSTMARK_SERVER_TOKEN=your_postmark_token
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_auth
TWILIO_PHONE_NUMBER=your_twilio_number
```

## Step 4: Domain Configuration

1. In Vercel project settings, go to "Domains"
2. Add your custom domain: `chainsoftwaregroup.com`
3. Follow Vercel's instructions to update your DNS records

## Step 5: API Routes

Your API routes are now serverless functions in the `/api` directory:

- `/api/health` - Health check
- `/api/agencies/register` - Agency registration
- `/api/agency/login` - Agency login
- `/api/consumer/login` - Consumer login
- `/api/consumer-registration` - Consumer registration
- `/api/consumer/accounts/[email]` - Get consumer accounts

## Step 6: Frontend Configuration

The frontend automatically uses the same domain for API calls, so no CORS configuration is needed.

## Step 7: Database Setup

Make sure your Supabase database has all the required tables. If needed, run the schema sync:

1. Update your local `.env` with the Supabase DATABASE_URL
2. Run: `npm run db:push --force`

## Deployment Architecture

```
┌─────────────────┐
│     Vercel      │
├─────────────────┤
│  Frontend (/)   │ ← Static files served by Vercel
├─────────────────┤
│  API (/api/*)   │ ← Serverless functions
└─────────────────┘
         ↓
┌─────────────────┐
│    Supabase     │
│   PostgreSQL    │
└─────────────────┘
```

## Benefits of This Architecture

1. **No CORS Issues**: Frontend and API on same domain
2. **Automatic Scaling**: Vercel handles traffic spikes
3. **Global CDN**: Fast loading worldwide
4. **Serverless**: No server management needed
5. **Cost Effective**: Pay only for what you use

## Troubleshooting

### 404 Errors on API Routes
- Check that API files are in `/api` directory
- Verify file names match the route (e.g., `/api/health.ts` for `/api/health`)
- Check Vercel Functions logs in dashboard

### Database Connection Issues
- Verify DATABASE_URL is correct in Vercel environment variables
- Check Supabase connection pooling settings
- Ensure database allows connections from Vercel IPs

### Authentication Issues
- Verify JWT_SECRET is set in environment variables
- Check that frontend stores and sends auth token correctly
- Review API route authentication logic

## Next Steps

After deployment:
1. Test all API endpoints
2. Verify agency registration and login work
3. Test consumer registration and login
4. Monitor Vercel Functions logs for any errors
5. Set up monitoring and alerts as needed