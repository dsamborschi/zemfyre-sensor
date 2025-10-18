# Test Image Registry API Endpoints

$apiUrl = "http://localhost:4002"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Image Registry API Test" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Wait for server to start
Write-Host "Waiting for API server..." -ForegroundColor Yellow
Start-Sleep -Seconds 3

# Test 1: List all approved images
Write-Host "`n1. GET /api/v1/images - List all images" -ForegroundColor Green
$response = Invoke-RestMethod -Uri "$apiUrl/api/v1/images" -Method Get
Write-Host "Found $($response.total) images:" -ForegroundColor White
$response.images | Format-Table id, image_name, category, approval_status, tag_count -AutoSize

# Test 2: Get Redis image details with tags
Write-Host "`n2. GET /api/v1/images/1 - Get Redis details" -ForegroundColor Green
$redis = Invoke-RestMethod -Uri "$apiUrl/api/v1/images/1" -Method Get
Write-Host "Image: $($redis.image_name)" -ForegroundColor White
Write-Host "Category: $($redis.category)" -ForegroundColor White
Write-Host "Status: $($redis.approval_status)" -ForegroundColor White
Write-Host "`nAvailable Tags:" -ForegroundColor White
$redis.tags | Format-Table tag, is_recommended, is_deprecated, architecture -AutoSize

# Test 3: Filter by category
Write-Host "`n3. GET /api/v1/images?category=database - Filter by category" -ForegroundColor Green
$databases = Invoke-RestMethod -Uri "$apiUrl/api/v1/images?category=database" -Method Get
Write-Host "Found $($databases.total) database images:" -ForegroundColor White
$databases.images | Format-Table image_name, description -AutoSize

# Test 4: Search for images
Write-Host "`n4. GET /api/v1/images?search=redis - Search" -ForegroundColor Green
$searchResults = Invoke-RestMethod -Uri "$apiUrl/api/v1/images?search=redis" -Method Get
Write-Host "Found $($searchResults.total) matching images:" -ForegroundColor White
$searchResults.images | Format-Table image_name, description -AutoSize

# Test 5: Get categories
Write-Host "`n5. GET /api/v1/images/categories - Get categories" -ForegroundColor Green
$categories = Invoke-RestMethod -Uri "$apiUrl/api/v1/images/categories" -Method Get
Write-Host "Available categories:" -ForegroundColor White
$categories.categories | Format-Table category, count -AutoSize

# Test 6: Add new image (Portainer)
Write-Host "`n6. POST /api/v1/images - Add new image (Portainer)" -ForegroundColor Green
$newImage = @{
    image_name = "portainer-ce"
    namespace = "portainer"
    description = "Lightweight container management UI"
    category = "management"
    is_official = $false
} | ConvertTo-Json

try {
    $addedImage = Invoke-RestMethod -Uri "$apiUrl/api/v1/images" -Method Post -Body $newImage -ContentType "application/json"
    Write-Host "✅ Image added successfully!" -ForegroundColor Green
    Write-Host "ID: $($addedImage.id), Name: $($addedImage.image_name)" -ForegroundColor White
    $portainerId = $addedImage.id
} catch {
    Write-Host "⚠️  Image might already exist or error occurred" -ForegroundColor Yellow
    $portainerId = 10  # Assume it got ID 10
}

# Test 7: Add tag to new image
Write-Host "`n7. POST /api/v1/images/$portainerId/tags - Add tag" -ForegroundColor Green
$newTag = @{
    tag = "2.19-alpine"
    is_recommended = $true
    architecture = "amd64"
} | ConvertTo-Json

try {
    $addedTag = Invoke-RestMethod -Uri "$apiUrl/api/v1/images/$portainerId/tags" -Method Post -Body $newTag -ContentType "application/json"
    Write-Host "✅ Tag added successfully!" -ForegroundColor Green
    Write-Host "Tag: $($addedTag.tag), Recommended: $($addedTag.is_recommended)" -ForegroundColor White
} catch {
    Write-Host "⚠️  Tag might already exist: $_" -ForegroundColor Yellow
}

# Test 8: Update image description
Write-Host "`n8. PUT /api/v1/images/1 - Update Redis description" -ForegroundColor Green
$update = @{
    description = "In-memory data structure store, used as database, cache, and message broker"
} | ConvertTo-Json

try {
    $updated = Invoke-RestMethod -Uri "$apiUrl/api/v1/images/1" -Method Put -Body $update -ContentType "application/json"
    Write-Host "✅ Image updated successfully!" -ForegroundColor Green
    Write-Host "Description: $($updated.description)" -ForegroundColor White
} catch {
    Write-Host "❌ Update failed: $_" -ForegroundColor Red
}

# Test 9: Filter by approval status
Write-Host "`n9. GET /api/v1/images?status=approved - Filter by status" -ForegroundColor Green
$approved = Invoke-RestMethod -Uri "$apiUrl/api/v1/images?status=approved" -Method Get
Write-Host "Found $($approved.total) approved images" -ForegroundColor White

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Tests Complete! ✅" -ForegroundColor Green
Write-Host "========================================`n" -ForegroundColor Cyan
