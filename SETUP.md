# CauseHealth. — Production Setup Guide

Everything you need to go live. Follow in order.

---

## 1. Create Accounts (if you haven't already)

- **Supabase**: https://supabase.com → New Project
- **Anthropic**: https://console.anthropic.com → Get API Key
- **Stripe**: https://dashboard.stripe.com → Register
- **Vercel** (for hosting): https://vercel.com

---

## 2. Supabase Project Setup

### 2a. Get your credentials
Go to **Supabase Dashboard → Settings → API**
- Copy `Project URL` (e.g. `https://abc123.supabase.co`)
- Copy `anon public` key (starts with `eyJ...`)

### 2b. Run the database migration
Go to **Supabase Dashboard → SQL Editor → New Query**
- Open `supabase/migration.sql` from this project
- Paste the entire file
- Click **Run**
- Verify: you should see 11 tables in Table Editor

### 2c. Create the storage bucket
Go to **Supabase Dashboard → Storage → New Bucket**
- Name: `lab-pdfs`
- Public: **OFF**
- File size limit: `20971520` (20MB)
- Allowed MIME types: `application/pdf`

### 2d. Configure Auth URLs
Go to **Supabase Dashboard → Auth → URL Configuration**
```
Site URL: https://causehealth.app   (or your domain)

Redirect URLs (add all 4):
  https://causehealth.app/auth/callback
  https://causehealth.app/auth/reset-password
  http://localhost:5173/auth/callback
  http://localhost:5173/auth/reset-password
```

### 2e. Enable Email Auth
Go to **Auth → Providers → Email**
- Enable: YES
- Confirm email: YES

### 2f. Enable Google Auth (optional)
Go to **Auth → Providers → Google**
1. Go to https://console.cloud.google.com
2. Create OAuth 2.0 credentials
3. Set authorized redirect URI to: `https://abc123.supabase.co/auth/v1/callback`
4. Paste Client ID + Client Secret into Supabase

---

## 3. Client Environment Variables

Create `causehealth/.env.local`:
```bash
VITE_SUPABASE_URL=https://abc123.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...your-anon-key
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_...
```

---

## 4. Stripe Setup

### 4a. Create your product + price
Go to **Stripe Dashboard → Products → Add Product**
- Name: `CauseHealth Pro`
- Price: `$7.00 / month` (recurring)
- Copy the **Price ID** (starts with `price_...`)

### 4b. Create webhook endpoint
Go to **Stripe Dashboard → Developers → Webhooks → Add Endpoint**
```
Endpoint URL: https://abc123.supabase.co/functions/v1/stripe-webhook
Events to send:
  ✓ customer.subscription.created
  ✓ customer.subscription.updated
  ✓ customer.subscription.deleted
  ✓ invoice.payment_failed
  ✓ invoice.payment_succeeded
```
- Copy the **Webhook Signing Secret** (starts with `whsec_...`)

---

## 5. Deploy Edge Functions

### 5a. Install Supabase CLI
```bash
npm install -g supabase
```

### 5b. Login and link project
```bash
supabase login
supabase link --project-ref abc123   # your project ref from dashboard URL
```

### 5c. Set all secrets
```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-api03-...
supabase secrets set STRIPE_SECRET_KEY=sk_live_...
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
supabase secrets set STRIPE_PRICE_ID=price_...
supabase secrets set APP_URL=https://causehealth.app
```

### 5d. Deploy all 8 Edge Functions
```bash
supabase functions deploy extract-labs
supabase functions deploy analyze-labs
supabase functions deploy generate-wellness-plan
supabase functions deploy analyze-symptoms
supabase functions deploy generate-doctor-prep
supabase functions deploy create-checkout-session
supabase functions deploy create-portal-session
supabase functions deploy stripe-webhook --no-verify-jwt
```

Note: `stripe-webhook` uses `--no-verify-jwt` because Stripe sends the request, not a logged-in user.

---

## 6. Test Locally

```bash
cd causehealth
npm run dev
```

Open http://localhost:5173
- Register a test account
- Complete onboarding
- Upload a lab PDF
- Verify all AI features work

---

## 7. Deploy to Vercel

### 7a. Connect repo
Go to https://vercel.com → Import Git Repository

### 7b. Set build settings
- Framework: Vite
- Root Directory: `causehealth`
- Build Command: `npm run build`
- Output Directory: `dist`

### 7c. Add environment variables in Vercel
```
VITE_SUPABASE_URL=https://abc123.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_...
```

### 7d. Deploy
Click Deploy. That's it.

### 7e. Update URLs
After deploy, go back to:
- **Supabase Auth → URL Configuration**: update Site URL to your Vercel domain
- **Stripe Webhooks**: update endpoint URL if using custom domain
- **Edge Function secrets**: update `APP_URL` to your production domain

---

## 8. Go Live Checklist

- [ ] Supabase project created
- [ ] Migration SQL run successfully (11 tables visible)
- [ ] `lab-pdfs` storage bucket created (private, 20MB, PDF only)
- [ ] Auth URLs configured (site URL + 4 redirect URLs)
- [ ] Email auth enabled with confirmation
- [ ] `.env.local` has all 3 client-side variables
- [ ] Stripe product + $7/month price created
- [ ] Stripe webhook endpoint registered (5 events)
- [ ] All 5 Edge Function secrets set
- [ ] All 8 Edge Functions deployed
- [ ] Local dev works: register → onboard → upload labs → see analysis
- [ ] Deployed to Vercel with env vars
- [ ] Production URLs updated in Supabase + Stripe

---

**CauseHealth.**
Your doctor has 12 minutes. We have everything they miss.
