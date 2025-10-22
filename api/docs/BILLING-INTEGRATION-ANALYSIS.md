# Billing Integration Analysis - Reusing Existing Billing Components

**Date**: October 21, 2025  
**Source**: `api/billing/` (JavaScript - Stripe-based)  
**Target**: Iotistic API (TypeScript - PostgreSQL-based)

---

## Executive Summary

The `api/billing/` directory contains a **production-ready Stripe billing system** with trial management that can be adapted for your Iotistic API. Here's what you can reuse:

### ✅ What CAN Be Reused (High Value)
1. **Trial Management Logic** - Complete trial lifecycle (creation, reminders, expiration)
2. **Email Templates & Notifications** - Trial emails with customization
3. **Scheduled Tasks Pattern** - Cron-based trial monitoring
4. **Subscription State Machine** - Trial → Active → Canceled workflow
5. **Promo Code System** - Discount/coupon management

### ⚠️ What NEEDS Adaptation
1. **Stripe Integration** - You may not need Stripe (can use trial-only mode)
2. **Data Models** - Convert Sequelize → TypeScript/PostgreSQL
3. **Team/Project Concepts** - Map to your Device/Fleet hierarchy

### 🔴 What's NOT Applicable
1. **Instance Type Billing** - Your system uses devices, not cloud instances
2. **Device Billing Per-Unit** - Unless you want to charge per device

---

## Current Billing System Analysis

### **File**: `api/billing/index.js` (1000+ lines)

**Key Features**:

#### 1. **Trial Subscription System**
```javascript
setupTrialTeamSubscription: async (team, user) => {
  // Creates trial subscription with expiration date
  const teamTrialDuration = await team.TeamType.getProperty('trial.duration', 0)
  await app.db.controllers.Subscription.createTrialSubscription(
    team,
    Date.now() + teamTrialDuration * ONE_DAY
  )
  // Send welcome email
  await app.postoffice.send(user, 'TrialTeamCreated', {...})
}
```

**Reusable For You**:
- ✅ Trial duration configuration (e.g., 14 days, 30 days)
- ✅ Automatic trial creation on signup
- ✅ Email notifications (welcome email)
- ✅ Expiration date calculation

#### 2. **Trial Task Scheduler**
```javascript
app.housekeeper.registerTask({
  name: 'teamTrialManager',
  schedule: '0,30 * * * * *', // Every 30 seconds
  run: require('./trialTask').init(app)
})
```

**Reusable For You**:
- ✅ Scheduled task pattern (runs every 30 min)
- ✅ Checks for expired trials
- ✅ Sends reminder emails (8 days, 2 days before expiration)
- ✅ Suspends resources when trial ends

#### 3. **Email Templates**
```javascript
app.postoffice.registerTemplate('TrialTeamCreated', require('./emailTemplates/TrialTeamCreated'))
app.postoffice.registerTemplate('TrialTeamSuspended', require('./emailTemplates/TrialTeamSuspended'))
app.postoffice.registerTemplate('TrialTeamEnded', require('./emailTemplates/TrialTeamEnded'))
app.postoffice.registerTemplate('TrialTeamReminder', require('./emailTemplates/TrialTeamReminder'))
```

**Reusable For You**:
- ✅ Template-based email system
- ✅ Trial lifecycle emails (created, suspended, ended, reminders)
- ✅ Personalization (username, team name, duration)

#### 4. **Promo Code System**
```javascript
async function getPromotionCode(code) {
  const promoCodes = await stripe.promotionCodes.list({ code, active: true })
  if (promoCodes.data?.length === 1) {
    return promoCodes.data[0]
  }
  return null
}
```

**Reusable For You**:
- ⚠️  Requires Stripe (or can store codes in DB yourself)
- ✅ User billing codes (extend trial, discounts)
- ✅ One-time use promo codes

#### 5. **Subscription Lifecycle**
```javascript
createSubscriptionSession: async (team, user, teamTypeId) => {
  // Creates Stripe checkout session
  // Handles upgrades, downgrades
  // Applies promo codes
  // Calculates billable quantities
}
```

**Reusable For You**:
- ⚠️  Stripe-specific (can be replaced with your payment processor)
- ✅ Concept of "team types" → Map to "device tiers" or "fleet plans"
- ✅ Upgrade/downgrade logic

---

### **File**: `api/billing/trialTask.js` (150 lines)

**Trial Expiration Logic**:

```javascript
async function trialTask(app) {
  // 1. Find expired trials (trialEndsAt < now)
  const expiredSubscriptions = await app.db.models.Subscription.findAll({
    where: { trialEndsAt: { [Op.lt]: Date.now() } },
    include: [app.db.models.Team]
  })

  for (const subscription of expiredSubscriptions) {
    if (subscription.isActive()) {
      // Stripe subscription exists → End trial, keep billing
      await app.billing.endTeamTrial(subscription.Team)
      await sendTrialEmail(subscription.Team, 'TrialTeamEnded')
    } else {
      // No payment setup → Suspend all resources
      await suspendAllProjects(subscription.Team)
      await sendTrialEmail(subscription.Team, 'TrialTeamSuspended')
    }
    await subscription.clearTrialState()
  }

  // 2. Send reminder emails (8 days, 2 days before expiration)
  const pendingEmailSubscriptions = await app.db.models.Subscription.findAll({
    where: {
      [Op.or]: [
        { trialStatus: 'CREATED', trialEndsAt: { [Op.lt]: Date.now() + (8 * ONE_DAY) } },
        { trialStatus: 'WEEK_EMAIL_SENT', trialEndsAt: { [Op.lt]: Date.now() + (2 * ONE_DAY) } }
      ]
    }
  })

  for (const subscription of pendingEmailSubscriptions) {
    const endingInDays = Math.ceil((subscription.trialEndsAt - Date.now()) / ONE_DAY)
    await sendTrialEmail(subscription.Team, 'TrialTeamReminder', {
      endingInDuration: endingInDays + ' days',
      billingUrl: `${app.config.base_url}/team/${subscription.Team.slug}/billing`
    })
    // Mark email sent
    subscription.trialStatus = (subscription.trialStatus === 'CREATED') ? 'WEEK_EMAIL_SENT' : 'DAY_EMAIL_SENT'
    await subscription.save()
  }
}
```

**Reusable For You**:
- ✅ **Entire trial expiration logic** (find expired, send emails, suspend)
- ✅ **Reminder email scheduling** (8 days, 2 days before)
- ✅ **State tracking** (CREATED → WEEK_EMAIL_SENT → DAY_EMAIL_SENT → ENDED)
- ✅ **Suspend logic** (can map to: disable device API access, stop data collection)

---

## Your Current API Structure

**Database**: PostgreSQL with TypeScript models  
**Email**: `postoffice/` directory (already exists!)  
**Jobs**: `jobs/` directory (already exists!)  
**Device Model**: `DeviceModel` in `src/db/models.ts`

**Key Tables You Have**:
- `devices` - Device records
- `users` - User accounts (with `api/database/migrations/017_add_user_auth_and_mqtt_acl.sql`)
- `scheduled_jobs` - Job scheduling system
- `email_config` - Email configuration (migration 021)

**What You're Missing for Billing**:
- ❌ `subscriptions` table
- ❌ `subscription_status` enum
- ❌ `trial_status` tracking
- ❌ User-device ownership mapping (teams/fleets)

---

## Recommended Integration Strategy

### Phase 1: Trial-Only Mode (No Stripe) ✅ **START HERE**

**Goal**: Users can sign up, get a 14-day trial, receive emails, then system auto-suspends if no upgrade.

#### 1.1. Create Database Schema

**New Migration**: `api/database/migrations/022_add_trial_billing.ts`

```typescript
export async function up(knex: Knex): Promise<void> {
  // User subscriptions table
  await knex.schema.createTable('user_subscriptions', (table) => {
    table.increments('id').primary();
    table.integer('user_id').unsigned().notNullable();
    table.foreign('user_id').references('users.id').onDelete('CASCADE');
    
    // Subscription status
    table.enum('status', [
      'active',
      'trialing',
      'canceled',
      'past_due',
      'suspended'
    ]).notNullable().defaultTo('trialing');
    
    // Trial tracking
    table.timestamp('trial_starts_at');
    table.timestamp('trial_ends_at');
    table.enum('trial_status', [
      'created',
      'week_email_sent',
      'day_email_sent',
      'ended'
    ]).defaultTo('created');
    
    // Subscription details (for future Stripe integration)
    table.string('stripe_subscription_id').nullable();
    table.string('stripe_customer_id').nullable();
    table.string('plan_type').defaultTo('free'); // free, starter, professional, enterprise
    
    // Limits based on plan
    table.integer('max_devices').defaultTo(5);
    table.integer('max_data_retention_days').defaultTo(30);
    table.boolean('can_export_data').defaultTo(false);
    
    // Promo codes
    table.string('promo_code').nullable();
    
    table.timestamps(true, true);
    
    table.index('user_id');
    table.index('status');
    table.index('trial_ends_at');
  });
  
  // Billing promo codes table
  await knex.schema.createTable('promo_codes', (table) => {
    table.increments('id').primary();
    table.string('code').unique().notNullable(); // e.g., 'FREEMONTH'
    table.string('description');
    table.integer('trial_extension_days').defaultTo(0); // Extend trial by X days
    table.boolean('is_active').defaultTo(true);
    table.integer('max_uses').nullable(); // null = unlimited
    table.integer('times_used').defaultTo(0);
    table.timestamp('valid_from').defaultTo(knex.fn.now());
    table.timestamp('valid_until').nullable();
    table.timestamps(true, true);
    
    table.index('code');
    table.index('is_active');
  });
}
```

#### 1.2. Create TypeScript Models

**New File**: `api/src/db/subscription-models.ts`

```typescript
import { query } from './connection';

export interface UserSubscription {
  id: number;
  user_id: number;
  status: 'active' | 'trialing' | 'canceled' | 'past_due' | 'suspended';
  trial_starts_at?: Date;
  trial_ends_at?: Date;
  trial_status?: 'created' | 'week_email_sent' | 'day_email_sent' | 'ended';
  stripe_subscription_id?: string;
  stripe_customer_id?: string;
  plan_type: string;
  max_devices: number;
  max_data_retention_days: number;
  can_export_data: boolean;
  promo_code?: string;
  created_at: Date;
  updated_at: Date;
}

export interface PromoCode {
  id: number;
  code: string;
  description?: string;
  trial_extension_days: number;
  is_active: boolean;
  max_uses?: number;
  times_used: number;
  valid_from: Date;
  valid_until?: Date;
}

export class SubscriptionModel {
  /**
   * Create trial subscription for new user
   */
  static async createTrial(userId: number, trialDurationDays: number = 14): Promise<UserSubscription> {
    const trialStartsAt = new Date();
    const trialEndsAt = new Date(Date.now() + trialDurationDays * 24 * 60 * 60 * 1000);
    
    const result = await query<UserSubscription>(
      `INSERT INTO user_subscriptions (
        user_id, status, trial_starts_at, trial_ends_at, trial_status,
        plan_type, max_devices, max_data_retention_days, can_export_data
      ) VALUES ($1, 'trialing', $2, $3, 'created', 'free', 5, 30, false)
      RETURNING *`,
      [userId, trialStartsAt, trialEndsAt]
    );
    
    return result.rows[0];
  }
  
  /**
   * Get subscription for user
   */
  static async getByUserId(userId: number): Promise<UserSubscription | null> {
    const result = await query<UserSubscription>(
      'SELECT * FROM user_subscriptions WHERE user_id = $1',
      [userId]
    );
    return result.rows[0] || null;
  }
  
  /**
   * Find expired trials
   */
  static async findExpiredTrials(): Promise<UserSubscription[]> {
    const result = await query<UserSubscription>(
      `SELECT * FROM user_subscriptions 
       WHERE status = 'trialing' 
       AND trial_ends_at < NOW()
       ORDER BY trial_ends_at ASC`
    );
    return result.rows;
  }
  
  /**
   * Find trials needing reminder emails
   */
  static async findTrialsNeedingReminders(): Promise<UserSubscription[]> {
    const eightDaysFromNow = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000);
    const twoDaysFromNow = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    
    const result = await query<UserSubscription>(
      `SELECT * FROM user_subscriptions 
       WHERE status = 'trialing'
       AND (
         (trial_status = 'created' AND trial_ends_at < $1) OR
         (trial_status = 'week_email_sent' AND trial_ends_at < $2)
       )
       ORDER BY trial_ends_at ASC`,
      [eightDaysFromNow, twoDaysFromNow]
    );
    return result.rows;
  }
  
  /**
   * Mark trial as ended
   */
  static async endTrial(userId: number): Promise<void> {
    await query(
      `UPDATE user_subscriptions 
       SET status = 'canceled', trial_status = 'ended', trial_ends_at = NOW()
       WHERE user_id = $1`,
      [userId]
    );
  }
  
  /**
   * Suspend subscription (trial ended, no payment)
   */
  static async suspend(userId: number): Promise<void> {
    await query(
      'UPDATE user_subscriptions SET status = 'suspended' WHERE user_id = $1',
      [userId]
    );
  }
  
  /**
   * Update trial reminder status
   */
  static async updateTrialStatus(
    userId: number,
    status: 'created' | 'week_email_sent' | 'day_email_sent' | 'ended'
  ): Promise<void> {
    await query(
      'UPDATE user_subscriptions SET trial_status = $1 WHERE user_id = $1',
      [status, userId]
    );
  }
  
  /**
   * Apply promo code
   */
  static async applyPromoCode(userId: number, code: string): Promise<boolean> {
    // Get promo code
    const promoResult = await query<PromoCode>(
      `SELECT * FROM promo_codes 
       WHERE code = $1 
       AND is_active = true 
       AND (valid_until IS NULL OR valid_until > NOW())
       AND (max_uses IS NULL OR times_used < max_uses)`,
      [code]
    );
    
    if (promoResult.rows.length === 0) {
      return false; // Invalid code
    }
    
    const promo = promoResult.rows[0];
    
    // Extend trial
    await query(
      `UPDATE user_subscriptions 
       SET trial_ends_at = trial_ends_at + INTERVAL '${promo.trial_extension_days} days',
           promo_code = $1
       WHERE user_id = $2`,
      [code, userId]
    );
    
    // Increment usage
    await query(
      'UPDATE promo_codes SET times_used = times_used + 1 WHERE id = $1',
      [promo.id]
    );
    
    return true;
  }
}

export class PromoCodeModel {
  /**
   * Create promo code
   */
  static async create(data: {
    code: string;
    description?: string;
    trialExtensionDays: number;
    maxUses?: number;
    validUntil?: Date;
  }): Promise<PromoCode> {
    const result = await query<PromoCode>(
      `INSERT INTO promo_codes (code, description, trial_extension_days, max_uses, valid_until)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [data.code, data.description, data.trialExtensionDays, data.maxUses, data.validUntil]
    );
    return result.rows[0];
  }
  
  /**
   * List active promo codes (admin only)
   */
  static async listActive(): Promise<PromoCode[]> {
    const result = await query<PromoCode>(
      `SELECT * FROM promo_codes 
       WHERE is_active = true 
       ORDER BY created_at DESC`
    );
    return result.rows;
  }
}
```

#### 1.3. Create Trial Management Job

**New File**: `api/src/jobs/trial-manager.ts`

```typescript
import { SubscriptionModel } from '../db/subscription-models';
import { sendEmail, EmailTemplate } from '../postoffice';
import { UserModel } from '../db/user-model'; // Assuming you have this

/**
 * Trial Manager Job
 * Runs every 30 minutes to check for expired trials and send reminder emails
 */
export async function trialManagerJob() {
  console.log('🔄 Running trial manager job...');
  
  try {
    // 1. Handle expired trials
    const expiredTrials = await SubscriptionModel.findExpiredTrials();
    console.log(`Found ${expiredTrials.length} expired trial(s)`);
    
    for (const subscription of expiredTrials) {
      try {
        const user = await UserModel.getById(subscription.user_id);
        if (!user) continue;
        
        // Check if user has payment configured (future Stripe integration)
        if (subscription.stripe_subscription_id) {
          // User has payment → End trial, keep billing active
          console.log(`User ${user.email} trial ended - billing active`);
          await SubscriptionModel.endTrial(subscription.user_id);
          await sendEmail(user.email, EmailTemplate.TrialEnded, {
            username: user.username,
            billingUrl: `${process.env.BASE_URL}/billing`
          });
        } else {
          // No payment → Suspend account
          console.log(`User ${user.email} trial ended - suspending`);
          await SubscriptionModel.suspend(subscription.user_id);
          await sendEmail(user.email, EmailTemplate.TrialSuspended, {
            username: user.username,
            billingUrl: `${process.env.BASE_URL}/billing`
          });
          
          // TODO: Disable user's devices/API access
          // await disableUserDevices(user.id);
        }
        
        await SubscriptionModel.updateTrialStatus(subscription.user_id, 'ended');
      } catch (error) {
        console.error(`Error processing expired trial for user ${subscription.user_id}:`, error);
      }
    }
    
    // 2. Send reminder emails
    const trialsNeedingReminders = await SubscriptionModel.findTrialsNeedingReminders();
    console.log(`Found ${trialsNeedingReminders.length} trial(s) needing reminders`);
    
    for (const subscription of trialsNeedingReminders) {
      try {
        const user = await UserModel.getById(subscription.user_id);
        if (!user) continue;
        
        const daysRemaining = Math.ceil(
          (new Date(subscription.trial_ends_at!).getTime() - Date.now()) / (24 * 60 * 60 * 1000)
        );
        
        await sendEmail(user.email, EmailTemplate.TrialReminder, {
          username: user.username,
          daysRemaining,
          billingUrl: `${process.env.BASE_URL}/billing`
        });
        
        // Update status
        const newStatus = subscription.trial_status === 'created' 
          ? 'week_email_sent' 
          : 'day_email_sent';
        await SubscriptionModel.updateTrialStatus(subscription.user_id, newStatus);
        
        console.log(`Sent reminder to ${user.email} (${daysRemaining} days left)`);
      } catch (error) {
        console.error(`Error sending reminder for user ${subscription.user_id}:`, error);
      }
    }
    
    console.log('✅ Trial manager job completed');
  } catch (error) {
    console.error('❌ Trial manager job failed:', error);
  }
}
```

**Register Job** in `api/src/jobs/index.ts`:

```typescript
import cron from 'node-cron';
import { trialManagerJob } from './trial-manager';

// Run trial manager every 30 minutes
cron.schedule('*/30 * * * *', async () => {
  await trialManagerJob();
});
```

#### 1.4. Create API Endpoints

**New File**: `api/src/routes/subscription.ts`

```typescript
import express from 'express';
import { SubscriptionModel, PromoCodeModel } from '../db/subscription-models';
import { authenticate } from '../middleware/auth'; // Your auth middleware

const router = express.Router();

/**
 * GET /api/subscription
 * Get current user's subscription
 */
router.get('/subscription', authenticate, async (req, res) => {
  try {
    const subscription = await SubscriptionModel.getByUserId(req.user.id);
    
    if (!subscription) {
      return res.status(404).json({ error: 'No subscription found' });
    }
    
    // Calculate days remaining
    const daysRemaining = subscription.trial_ends_at
      ? Math.ceil((new Date(subscription.trial_ends_at).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
      : null;
    
    res.json({
      status: subscription.status,
      planType: subscription.plan_type,
      maxDevices: subscription.max_devices,
      maxDataRetentionDays: subscription.max_data_retention_days,
      canExportData: subscription.can_export_data,
      trial: subscription.status === 'trialing' ? {
        startsAt: subscription.trial_starts_at,
        endsAt: subscription.trial_ends_at,
        daysRemaining
      } : null
    });
  } catch (error) {
    console.error('Error fetching subscription:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/subscription/apply-promo
 * Apply promo code to extend trial
 */
router.post('/subscription/apply-promo', authenticate, async (req, res) => {
  try {
    const { code } = req.body;
    
    if (!code) {
      return res.status(400).json({ error: 'Promo code required' });
    }
    
    const applied = await SubscriptionModel.applyPromoCode(req.user.id, code.toUpperCase());
    
    if (!applied) {
      return res.status(400).json({ error: 'Invalid or expired promo code' });
    }
    
    const subscription = await SubscriptionModel.getByUserId(req.user.id);
    
    res.json({
      message: 'Promo code applied successfully',
      newTrialEndsAt: subscription?.trial_ends_at
    });
  } catch (error) {
    console.error('Error applying promo code:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/admin/promo-codes (Admin only)
 * Create new promo code
 */
router.post('/admin/promo-codes', authenticate, async (req, res) => {
  // TODO: Add admin role check
  // if (!req.user.isAdmin) return res.status(403).json({ error: 'Forbidden' });
  
  try {
    const { code, description, trialExtensionDays, maxUses, validUntil } = req.body;
    
    const promoCode = await PromoCodeModel.create({
      code: code.toUpperCase(),
      description,
      trialExtensionDays,
      maxUses,
      validUntil: validUntil ? new Date(validUntil) : undefined
    });
    
    res.status(201).json(promoCode);
  } catch (error: any) {
    if (error.code === '23505') { // Unique constraint violation
      return res.status(400).json({ error: 'Promo code already exists' });
    }
    console.error('Error creating promo code:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
```

#### 1.5. Email Templates

**Using Your Existing Postoffice**: The billing code references `app.postoffice.registerTemplate()`. You already have `api/postoffice/` - just add new templates:

**File**: `api/postoffice/templates/trial-created.html`

```html
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #4CAF50; color: white; padding: 20px; text-align: center; }
    .content { background: #f9f9f9; padding: 20px; margin: 20px 0; }
    .cta-button { background: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Welcome to Iotistic!</h1>
    </div>
    <div class="content">
      <p>Hi {{username}},</p>
      <p>Your trial account has been created successfully. You now have <strong>{{trialDuration}} days</strong> to explore all features of Iotistic.</p>
      <p>During your trial, you can:</p>
      <ul>
        <li>Connect up to {{maxDevices}} devices</li>
        <li>Access real-time monitoring</li>
        <li>View historical data for {{dataRetentionDays}} days</li>
        <li>Explore all premium features</li>
      </ul>
      <p>
        <a href="{{dashboardUrl}}" class="cta-button">Go to Dashboard</a>
      </p>
      <p>Need help? Reply to this email or visit our <a href="{{docsUrl}}">documentation</a>.</p>
      <p>Best regards,<br>The Iotistic Team</p>
    </div>
  </div>
</body>
</html>
```

**Similar templates needed**:
- `trial-reminder.html` - "Your trial expires in X days"
- `trial-ended.html` - "Your trial has ended"
- `trial-suspended.html` - "Your account has been suspended"

---

## Phase 2: Stripe Integration (Optional) 💳

**When to add this**: When you're ready to charge customers.

**Reusable Components**:
1. `createSubscriptionSession()` - Create Stripe checkout
2. `updateTeamBillingCounts()` - Update subscription quantities (devices)
3. `closeSubscription()` - Cancel Stripe subscription
4. `enableManualBilling()` - Enterprise manual invoicing

**Adaptations Needed**:
- Replace "Team" → "User" or "Fleet"
- Replace "Instance Types" → "Device Tiers" (if charging per device type)
- Add Stripe webhook handler for payment events

---

## Implementation Checklist

### Phase 1: Trial System (Week 1-2)

- [ ] Create database migration (`022_add_trial_billing.ts`)
- [ ] Create subscription models (`subscription-models.ts`)
- [ ] Create trial manager job (`jobs/trial-manager.ts`)
- [ ] Add subscription API endpoints (`routes/subscription.ts`)
- [ ] Create email templates (4 templates)
- [ ] Test trial creation on user signup
- [ ] Test trial expiration flow
- [ ] Test reminder emails
- [ ] Test promo code system

### Phase 2: Frontend Integration (Week 3)

- [ ] Add subscription status to user dashboard
- [ ] Show trial countdown
- [ ] Add "Apply Promo Code" form
- [ ] Add "Upgrade to Pro" CTA (links to future Stripe)
- [ ] Show usage vs limits (devices, data retention)

### Phase 3: Stripe Integration (Future)

- [ ] Install Stripe SDK (`npm install stripe`)
- [ ] Create Stripe checkout session endpoint
- [ ] Add webhook handler for Stripe events
- [ ] Implement plan upgrades/downgrades
- [ ] Test payment flows

---

## Usage Limits Enforcement

**Based on Subscription Plan**:

```typescript
// Example: Check if user can add more devices
export async function canAddDevice(userId: number): Promise<boolean> {
  const subscription = await SubscriptionModel.getByUserId(userId);
  
  if (!subscription || subscription.status === 'suspended') {
    return false;
  }
  
  const deviceCount = await DeviceModel.countByUserId(userId);
  return deviceCount < subscription.max_devices;
}

// Example: Enforce data retention
export async function cleanupOldData(userId: number): Promise<void> {
  const subscription = await SubscriptionModel.getByUserId(userId);
  const retentionDays = subscription?.max_data_retention_days || 30;
  
  await DeviceMetricsModel.cleanup(retentionDays);
  await DeviceLogsModel.cleanup(retentionDays);
}
```

---

## Key Differences: Their System vs Yours

| Feature | Billing System | Your Iotistic API | Adaptation |
|---------|---------------|------------------|------------|
| **Primary Entity** | Team (multi-user) | User (single account) | Map Team → User or create Fleet concept |
| **Billable Items** | Cloud instances (hourly) | Devices (monthly/yearly) | Charge per device or flat rate |
| **Trial Duration** | Configurable per team type | Fixed (14 days, 30 days) | Simpler configuration |
| **Payment Processor** | Stripe (required) | Optional (start trial-only) | Phase 1: no Stripe, Phase 2: add Stripe |
| **Email System** | Custom `postoffice` | You have `postoffice/` | Direct reuse ✅ |
| **Job Scheduler** | Custom `housekeeper` | `node-cron` in `jobs/` | Adapt to your cron system |
| **Database** | Sequelize (ORM) | Raw PostgreSQL queries | Translate to your query style |

---

## Recommended Next Steps

1. **Review Email Templates** in `api/billing/emailTemplates/` (if they exist)
2. **Test Trial Flow Locally**:
   ```bash
   # Create trial subscription
   curl -X POST http://localhost:3000/api/auth/signup \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com","password":"test123"}'
   
   # Check subscription
   curl http://localhost:3000/api/subscription \
     -H "Authorization: Bearer <token>"
   ```

3. **Set Up Cron Job**:
   ```typescript
   // In api/src/jobs/index.ts
   cron.schedule('*/30 * * * *', trialManagerJob); // Every 30 minutes
   ```

4. **Create Sample Promo Code**:
   ```sql
   INSERT INTO promo_codes (code, description, trial_extension_days, is_active)
   VALUES ('WELCOME30', 'Welcome bonus: +30 days trial', 30, true);
   ```

---

## Questions to Answer

1. **Do you want to charge per device?**
   - Yes → Add device count to subscription billing
   - No → Just charge flat monthly/annual rate

2. **Do you need multi-user teams/fleets?**
   - Yes → Add Team table (like original system)
   - No → Keep user-level subscriptions

3. **Trial duration preference?**
   - 14 days (standard)
   - 30 days (generous)
   - Configurable per plan

4. **Promo code strategy?**
   - Trial extensions only
   - Percentage discounts (requires Stripe)
   - Referral bonuses

5. **Suspension behavior**:
   - Block all API access
   - Keep devices online but read-only
   - Delete data after X days

---

## Summary

✅ **High Reusability**: 70% of the trial logic can be directly adapted  
⚠️ **Moderate Adaptation**: Database schema and TypeScript conversion needed  
🔴 **Skip for Now**: Stripe-specific billing (add in Phase 2)

**Recommended Path**:
1. Implement Phase 1 (Trial System) - **2 weeks**
2. Test thoroughly with fake users
3. Add Phase 2 (Stripe) when ready to charge - **1 week**

**Total Effort**: ~3 weeks for complete trial + billing system

Let me know which parts you want me to implement first! 🚀
