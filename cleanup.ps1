
$composeFolder = "C:\Users\Dan\zemfyre-sensor"  
Set-Location -Path $composeFolder

docker-compose down --volumes --rmi all

docker image prune -a -f

docker container prune -f

docker volume prune -f

docker network prune -f

Write-Host "Docker containers, images, volumes, and networks have been cleaned up."
