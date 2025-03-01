# Define GitHub repository URL and local folder
$repoUrl = "https://github.com/dsamborschi/zemfyre-sensor.git"
$localFolder = "C:\"

# Check if the folder exists, create if it doesn't
if (-not (Test-Path -Path $localFolder)) {
    New-Item -Path $localFolder -ItemType Directory
}

# Navigate to the local folder
Set-Location -Path $localFolder

# Clone the repository from GitHub
git clone $repoUrl

# Navigate to the cloned repository folder
$repoName = "zemfyre-sensor"  # Replace with your repository name
Set-Location -Path "$localFolder\$repoName"

# Check if Docker Compose is installed
$dockerCompose = Get-Command docker-compose -ErrorAction SilentlyContinue
if (-not $dockerCompose) {
    Write-Host "Docker Compose is not installed. Please install Docker Compose before proceeding."
    exit
}

# Run Docker Compose
docker-compose up -d

# Print success message
Write-Host "Docker Compose is now running the services."
