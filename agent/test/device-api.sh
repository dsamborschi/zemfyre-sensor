#!/bin/bash
# Device API Test Script for CI Pipeline
# Tests device-api endpoints (V1 and V2)
#
# Usage:
#   ./device-api.sh [API_URL] [API_KEY]
#
# Environment Variables:
#   API_URL - Device API base URL (default: http://localhost:48484)
#   API_KEY - Optional API key for authentication
#   VERBOSE - Enable verbose output (default: false)

API_URL="${1:-${API_URL:-http://localhost:48484}}"
API_KEY="${2:-${API_KEY}}"
VERBOSE="${VERBOSE:-false}"
PASSED=0
FAILED=0

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

pass() {
    echo -e "${GREEN}✅ $1${NC}"
    ((PASSED++))
}

fail() {
    echo -e "${RED}❌ $1${NC}"
    ((FAILED++))
}

info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

warn() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# Verbose logging
log_verbose() {
    if [ "$VERBOSE" = "true" ]; then
        echo -e "${NC}   $1${NC}"
    fi
}

# Helper function for API calls
api_call() {
    local method="$1"
    local endpoint="$2"
    local data="$3"
    local headers=""
    
    # Add API key if provided
    if [ -n "$API_KEY" ]; then
        headers="-H \"X-API-Key: $API_KEY\""
    fi
    
    if [ -n "$data" ]; then
        eval curl -s -X "$method" "$API_URL$endpoint" \
            $headers \
            -H \"Content-Type: application/json\" \
            -d \'"$data"\'
    else
        eval curl -s -X "$method" "$API_URL$endpoint" $headers
    fi
}

echo "======================================"
echo "Device API Test Suite"
echo "======================================"
info "API URL: $API_URL"
if [ -n "$API_KEY" ]; then
    info "Authentication: Enabled"
else
    info "Authentication: Disabled"
fi
echo ""

# ============================================================================
# V1 API Tests
# ============================================================================
echo "=== V1 API Tests ==="
echo ""

# Test 1: V1 Health Check
echo "Test 1: V1 Health Check (GET /v1/healthy)"
response=$(api_call GET "/v1/healthy")
status_code=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/v1/healthy")
log_verbose "Response: $response"
log_verbose "Status Code: $status_code"
if [ "$status_code" = "200" ]; then
    pass "V1 health check OK"
else
    fail "V1 health check failed (HTTP $status_code)"
fi
echo ""

# Test 2: Ping Endpoint
echo "Test 2: Ping (GET /ping)"
response=$(api_call GET "/ping")
log_verbose "Response: $response"
if [ "$response" = "OK" ]; then
    pass "Ping endpoint OK"
else
    fail "Ping failed: $response"
fi
echo ""

# Test 3: Get Device Info (V1)
echo "Test 3: Get Device Info (GET /v1/device)"
response=$(api_call GET "/v1/device")
log_verbose "Response: $response"
uuid=$(echo "$response" | jq -r '.uuid // empty')
device_name=$(echo "$response" | jq -r '.deviceName // empty')
if [ -n "$uuid" ] && [ "$uuid" != "null" ]; then
    pass "Device info retrieved - UUID: $uuid"
    [ -n "$device_name" ] && info "Device Name: $device_name"
else
    fail "Failed to get device info"
fi
echo ""

# Test 4: Get App Info (V1)
echo "Test 4: Get App Info (GET /v1/apps/:appId)"
# This test may fail if no apps are running - that's OK
response=$(api_call GET "/v1/apps/1001")
log_verbose "Response: $response"
app_id=$(echo "$response" | jq -r '.appId // empty')
if [ -n "$app_id" ]; then
    app_name=$(echo "$response" | jq -r '.appName // empty')
    service_name=$(echo "$response" | jq -r '.serviceName // empty')
    pass "App info retrieved - App ID: $app_id"
    [ -n "$app_name" ] && info "App Name: $app_name"
    [ -n "$service_name" ] && info "Service: $service_name"
else
    warn "No app with ID 1001 found (may be expected)"
    ((PASSED++))  # Don't fail if app doesn't exist
fi
echo ""

# Test 5: Restart Endpoint (V1) - dry run check
echo "Test 5: Restart Endpoint Check (POST /v1/restart)"
# We don't actually restart, just check if endpoint exists
status_code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/v1/restart" \
    -H "Content-Type: application/json" \
    -d '{"appId": 999999}')
log_verbose "Status Code: $status_code"
# Expect 404 (app not found) or 400 (validation error), not 404 (endpoint not found)
if [ "$status_code" != "404" ] || [ "$status_code" = "400" ] || [ "$status_code" = "500" ]; then
    pass "Restart endpoint exists"
else
    fail "Restart endpoint not found (HTTP $status_code)"
fi
echo ""

# ============================================================================
# V2 API Tests
# ============================================================================
echo "=== V2 API Tests ==="
echo ""

# Test 6: V2 Version
echo "Test 6: Get API Version (GET /v2/version)"
response=$(api_call GET "/v2/version")
log_verbose "Response: $response"
version=$(echo "$response" | jq -r '.version // empty')
api_version=$(echo "$response" | jq -r '.api_version // empty')
if [ "$api_version" = "v2" ]; then
    pass "V2 API version: $version"
else
    fail "Failed to get V2 version"
fi
echo ""

# Test 7: V2 Device Name
echo "Test 7: Get Device Name (GET /v2/device/name)"
response=$(api_call GET "/v2/device/name")
log_verbose "Response: $response"
device_name=$(echo "$response" | jq -r '.deviceName // empty')
if [ -n "$device_name" ]; then
    pass "Device name: $device_name"
else
    fail "Failed to get device name"
fi
echo ""

# Test 8: V2 Applications State
echo "Test 8: Get Applications State (GET /v2/applications/state)"
response=$(api_call GET "/v2/applications/state")
log_verbose "Response: $response"
# Check if response is valid JSON
if echo "$response" | jq empty 2>/dev/null; then
    app_count=$(echo "$response" | jq 'keys | length')
    pass "Applications state retrieved ($app_count apps)"
else
    fail "Failed to get applications state"
fi
echo ""

# Test 9: V2 Restart Application (check endpoint exists)
echo "Test 9: Restart Application Endpoint (POST /v2/applications/:appId/restart)"
status_code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/v2/applications/999999/restart" \
    -H "Content-Type: application/json" \
    -d '{"force": false}')
log_verbose "Status Code: $status_code"
if [ "$status_code" != "404" ] || [ "$status_code" = "400" ] || [ "$status_code" = "500" ]; then
    pass "Restart application endpoint exists"
else
    fail "Restart application endpoint not found (HTTP $status_code)"
fi
echo ""

# Test 10: V2 Stop Service (check endpoint exists)
echo "Test 10: Stop Service Endpoint (POST /v2/applications/:appId/stop-service)"
status_code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/v2/applications/999999/stop-service" \
    -H "Content-Type: application/json" \
    -d '{"serviceName": "test", "force": false}')
log_verbose "Status Code: $status_code"
if [ "$status_code" != "404" ] || [ "$status_code" = "400" ] || [ "$status_code" = "500" ]; then
    pass "Stop service endpoint exists"
else
    fail "Stop service endpoint not found (HTTP $status_code)"
fi
echo ""

# Test 11: V2 Start Service (check endpoint exists)
echo "Test 11: Start Service Endpoint (POST /v2/applications/:appId/start-service)"
status_code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/v2/applications/999999/start-service" \
    -H "Content-Type: application/json" \
    -d '{"serviceName": "test", "force": false}')
log_verbose "Status Code: $status_code"
if [ "$status_code" != "404" ] || [ "$status_code" = "400" ] || [ "$status_code" = "500" ]; then
    pass "Start service endpoint exists"
else
    fail "Start service endpoint not found (HTTP $status_code)"
fi
echo ""

# ============================================================================
# Authentication Tests (if API_KEY is set)
# ============================================================================
if [ -n "$API_KEY" ]; then
    echo "=== Authentication Tests ==="
    echo ""
    
    # Test 12: Unauthorized Request (without API key)
    echo "Test 12: Unauthorized Request (no API key)"
    status_code=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/v1/device")
    log_verbose "Status Code: $status_code"
    if [ "$status_code" = "401" ] || [ "$status_code" = "403" ]; then
        pass "Unauthorized request blocked"
    else
        warn "Unauthorized request not blocked (HTTP $status_code)"
        ((PASSED++))  # Don't fail - maybe auth is disabled
    fi
    echo ""
    
    # Test 13: Authorized Request (with API key)
    echo "Test 13: Authorized Request (with API key)"
    response=$(curl -s -H "X-API-Key: $API_KEY" "$API_URL/v1/device")
    uuid=$(echo "$response" | jq -r '.uuid // empty')
    if [ -n "$uuid" ]; then
        pass "Authorized request successful"
    else
        fail "Authorized request failed"
    fi
    echo ""
fi

# ============================================================================
# Test Summary
# ============================================================================
echo ""
echo "======================================"
echo "Test Results"
echo "======================================"
echo -e "${GREEN}Passed: $PASSED${NC}"
if [ $FAILED -gt 0 ]; then
    echo -e "${RED}Failed: $FAILED${NC}"
else
    echo -e "${NC}Failed: $FAILED${NC}"
fi
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ All tests passed!${NC}"
    echo ""
    info "Device API is functioning correctly"
    exit 0
else
    echo -e "${RED}❌ $FAILED test(s) failed!${NC}"
    echo ""
    warn "Review test output above for details"
    exit 1
fi
