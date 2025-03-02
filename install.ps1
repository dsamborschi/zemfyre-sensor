
$repoUrl = "https://github.com/dsamborschi/zemfyre-sensor.git"
$localFolder = "C:\"


if (-not (Test-Path -Path $localFolder)) {
    New-Item -Path $localFolder -ItemType Directory
}


Set-Location -Path $localFolder

git clone $repoUrl

$repoName = "zemfyre-sensor" 
Set-Location -Path "$localFolder\$repoName"

$dockerCompose = Get-Command docker-compose -ErrorAction SilentlyContinue
if (-not $dockerCompose) {
    Write-Host "Docker Compose is not installed. Please install Docker Compose before proceeding."
    exit
}

docker-compose up -d

Write-Host "Docker Compose is now running the services."
