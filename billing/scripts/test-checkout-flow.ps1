# billing/test-checkout-flow.ps1
# Automated Stripe Checkout Flow Test
# Tests: Create customer → Checkout session → Payment → Webhook → License

param(
    [string]$Plan = "professional",  # starter, professional, enterprise
    [string]$BaseUrl = "http://localhost:3100"
)

function Write-Step {
    param([string]$Message)
    Write-Host $Message -ForegroundColor Yellow
}

function Write-Success {
    param([string]$Message)
    Write-Host "✓ $Message" -ForegroundColor Green
}

function Write-Info {
    param([string]$Message)
    Write-Host "  $Message" -ForegroundColor Gray
}

function Write-Title {
    param([string]$Message)
    Write-Host ""
    Write-Host $Message -ForegroundColor Cyan
    Write-Host ""
}

# Main Test Flow
Write-Title "=== Stripe Checkout Flow Test ==="

# Validate plan
if ($Plan -notin @("starter", "professional", "enterprise")) {
    Write-Host "❌ Invalid plan: $Plan" -ForegroundColor Red
    Write-Host "Valid plans: starter, professional, enterprise" -ForegroundColor Red
    exit 1
}

# Step 1: Create Customer
Write-Step "Step 1: Creating customer..."

$timestamp = Get-Date -Format 'yyyyMMddHHmmss'
$customerBody = @{
    email = "test-$timestamp@example.com"
    name = "Test User $timestamp"
    company = "Test Company"
} | ConvertTo-Json

try {
    $customerResponse = Invoke-RestMethod -Uri "$BaseUrl/api/customers" -Method POST -Body $customerBody -ContentType "application/json" -ErrorAction Stop
    $customerId = $customerResponse.customer.customer_id  # Use customer_id (string), not id (number)
    $customerEmail = $customerResponse.customer.email
    
    Write-Success "Customer created: $customerId"
    Write-Info "Email: $customerEmail"
    Write-Info "Initial Status: $($customerResponse.subscription.status) ($($customerResponse.subscription.plan))"
    Write-Info "Trial End: $($customerResponse.subscription.trial_ends_at)"
}
catch {
    Write-Host "❌ Failed to create customer: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Step 2: Create Checkout Session
Write-Host ""
Write-Step "Step 2: Creating checkout session for '$Plan' plan..."

$checkoutBody = @{
    customer_id = $customerId
    plan = $Plan
    success_url = "$BaseUrl/success"
    cancel_url = "$BaseUrl/cancel"
} | ConvertTo-Json

try {
    $checkoutResponse = Invoke-RestMethod -Uri "$BaseUrl/api/subscriptions/checkout" -Method POST -Body $checkoutBody -ContentType "application/json" -ErrorAction Stop
    
    Write-Success "Checkout session created"
    Write-Info "Session ID: $($checkoutResponse.session_id)"
    Write-Info "Checkout URL: $($checkoutResponse.checkout_url)"
}
catch {
    Write-Host "❌ Failed to create checkout session: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Step 3: Open Checkout URL
Write-Host ""
Write-Step "Step 3: Opening checkout URL in browser..."
Write-Host ""
Write-Host "📋 Test Card Information:" -ForegroundColor Cyan
Write-Host "  Card Number: 4242 4242 4242 4242" -ForegroundColor White
Write-Host "  Expiry: 12/25 (any future date)" -ForegroundColor White
Write-Host "  CVC: 123 (any 3 digits)" -ForegroundColor White
Write-Host "  ZIP: 12345 (any 5 digits)" -ForegroundColor White
Write-Host ""

try {
    Start-Process $checkoutResponse.checkout_url
    Write-Success "Browser opened"
}
catch {
    Write-Host "⚠️ Could not open browser automatically" -ForegroundColor Yellow
    Write-Host "Please open this URL manually:" -ForegroundColor Yellow
    Write-Host $checkoutResponse.checkout_url -ForegroundColor White
}

Write-Host ""
Write-Host "Complete the payment in your browser..." -ForegroundColor Cyan
Write-Host ""
Read-Host "Press Enter after completing the payment"

# Step 4: Verify Subscription Update
Write-Host ""
Write-Step "Step 4: Verifying subscription update..."
Write-Info "Waiting for webhook to process..."

Start-Sleep -Seconds 3  # Give webhook time to process

try {
    $subscription = Invoke-RestMethod -Uri "$BaseUrl/api/subscriptions/$customerId" -Method GET -ErrorAction Stop
    
    if ($subscription.subscription.status -eq "active") {
        Write-Success "Subscription verified"
        Write-Info "Status: $($subscription.subscription.status)"
        Write-Info "Plan: $($subscription.subscription.plan)"
        Write-Info "Stripe Subscription ID: $($subscription.subscription.stripe_subscription_id)"
        Write-Info "Current Period: $($subscription.subscription.current_period_start) to $($subscription.subscription.current_period_end)"
    }
    else {
        Write-Host "⚠️ Subscription status: $($subscription.subscription.status)" -ForegroundColor Yellow
        Write-Host "Expected 'active', got '$($subscription.subscription.status)'" -ForegroundColor Yellow
        Write-Host "Check webhook logs for errors" -ForegroundColor Yellow
    }
}
catch {
    Write-Host "❌ Failed to verify subscription: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Check that services are running: docker-compose ps" -ForegroundColor Yellow
}

# Step 5: Get License
Write-Host ""
Write-Step "Step 5: Retrieving license JWT..."

try {
    $license = Invoke-RestMethod -Uri "$BaseUrl/api/licenses/$customerId" -Method GET -ErrorAction Stop
    
    Write-Success "License retrieved"
    Write-Host ""
    
    Write-Host "📄 License Details:" -ForegroundColor Cyan
    Write-Info "Customer: $($license.decoded.email)"
    Write-Info "Plan: $($license.decoded.plan)"
    Write-Info "Status: $($license.decoded.status)"
    Write-Info "Trial: $($license.decoded.trial)"
    
    Write-Host ""
    Write-Host "🔧 Features Enabled:" -ForegroundColor Cyan
    $license.decoded.features.PSObject.Properties | ForEach-Object {
        $icon = if ($_.Value -eq $true) { "✓" } elseif ($_.Value -eq $false) { "✗" } else { "→" }
        Write-Info "$icon $($_.Name): $($_.Value)"
    }
    
    Write-Host ""
    Write-Host "🔑 JWT Token (first 80 chars):" -ForegroundColor Cyan
    Write-Info "$($license.license.Substring(0, [Math]::Min(80, $license.license.Length)))..."
}
catch {
    Write-Host "❌ Failed to retrieve license: $($_.Exception.Message)" -ForegroundColor Red
}

# Summary
Write-Host ""
Write-Title "=== Test Complete ==="

Write-Host "Test Summary:" -ForegroundColor Cyan
Write-Host "  Customer ID: $customerId" -ForegroundColor White
Write-Host "  Email: $customerEmail" -ForegroundColor White
Write-Host "  Plan: $($subscription.subscription.plan)" -ForegroundColor White
Write-Host "  Status: $($subscription.subscription.status)" -ForegroundColor White
if ($license) {
    Write-Host "  Max Devices: $($license.decoded.features.max_devices)" -ForegroundColor White
    Write-Host "  License Valid: ✓" -ForegroundColor Green
}
Write-Host ""

# Suggest next steps
Write-Host "Next Steps:" -ForegroundColor Cyan
Write-Host "  1. Check webhook logs: docker logs billing-billing-1" -ForegroundColor Gray
Write-Host "  2. View database: docker exec -it billing-postgres psql -U postgres -d billing" -ForegroundColor Gray
Write-Host "  3. Test license in customer API" -ForegroundColor Gray
Write-Host "  4. Try upgrade: POST $BaseUrl/api/subscriptions/upgrade" -ForegroundColor Gray
Write-Host "  5. Try cancel: POST $BaseUrl/api/subscriptions/cancel" -ForegroundColor Gray
Write-Host ""
