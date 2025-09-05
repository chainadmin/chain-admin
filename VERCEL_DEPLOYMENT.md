# Vercel Deployment Guide

## Prerequisites
1. Vercel account (free tier works)
2. GitHub repository connected to Vercel
3. PostgreSQL database (Neon, Supabase, or any cloud PostgreSQL)

## Steps to Deploy

### 1. Push to GitHub
Since I cannot push to GitHub, you'll need to:
```bash
git add .
git commit -m "Add Vercel deployment configuration"
git push origin main
```

### 2. Import to Vercel
1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click "New Project"
3. Import your GitHub repository
4. Select the repository containing this code

### 3. Configure Environment Variables
In Vercel project settings, add these environment variables:

**Required:**
- `DATABASE_URL` - Your PostgreSQL connection string
- `SESSION_SECRET` - Generate a random string (32+ characters)
- `NODE_ENV` - Set to "production"

**Optional (if using these features):**
- `SENDGRID_API_KEY` - For SendGrid email
- `POSTMARK_SERVER_TOKEN` - For Postmark email
- `STRIPE_SECRET_KEY` - For Stripe payments
- `FRONTEND_URL` - Your frontend domain for CORS

### 4. Configure Build Settings
Vercel should auto-detect these, but verify:
- **Framework Preset:** Vite
- **Build Command:** `npm run build`
- **Output Directory:** `dist/public`
- **Install Command:** `npm install`

### 5. Deploy
1. Click "Deploy"
2. Wait for the build to complete (3-5 minutes)
3. Your app will be available at `your-project.vercel.app`

### 6. Set Up Database
After deployment, run database migrations:
1. Go to your Vercel project dashboard
2. Go to "Functions" tab
3. Visit: `https://your-project.vercel.app/api/fix-production-db`
4. Or run `npm run db:push` from your local machine with the production DATABASE_URL

## Custom Domain (Optional)
1. Go to Settings → Domains
2. Add your custom domain
3. Follow DNS configuration instructions

## Important Notes

### Authentication
- Replit Auth won't work on Vercel
- You'll need to implement a different auth strategy (Auth0, Clerk, Supabase Auth, etc.)
- Or use the username/password system already built for agencies

### Database
- Make sure your database allows connections from Vercel's IP ranges
- For Neon: Enable "Pooler" and use the pooled connection string
- For Supabase: Use the connection pooler URL

### File Uploads
- File uploads won't persist on Vercel (serverless)
- Use a cloud storage service (AWS S3, Cloudinary, etc.) for uploaded files

## Troubleshooting

### 500 Errors
- Check environment variables are set correctly
- Check database connection string
- View function logs in Vercel dashboard

### Database Connection Issues
- Ensure DATABASE_URL uses SSL: `?sslmode=require`
- Check if database allows Vercel's IP addresses
- Try using connection pooling

### Build Failures
- Check Node version compatibility (use Node 20.x)
- Ensure all dependencies are in package.json
- Check for TypeScript errors with `npm run check`

## Local Testing for Vercel
```bash
# Install Vercel CLI
npm i -g vercel

# Run locally with Vercel environment
vercel dev
```

This will simulate the Vercel environment locally for testing.