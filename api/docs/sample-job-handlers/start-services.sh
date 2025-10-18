#!/usr/bin/env sh
set -e

echo "Running start-services.sh"
user=$1
shift 1
services=$@
echo "Username: $user"
echo "Services to start: $services"

if command -v "systemctl" > /dev/null; then
  for service in $services
  do
    if id "$user" 2>/dev/null && command -v "sudo" > /dev/null; then
      sudo -u "$user" -n systemctl start "$service"
    else
      echo "username or sudo command not found"
      systemctl start "$service"
    fi
    echo "Started service: $service"
  done
elif command -v "service" > /dev/null; then
  for service in $services
  do
    if id "$user" 2>/dev/null && command -v "sudo" > /dev/null; then
      sudo -u "$user" -n service "$service" start
    else
      echo "username or sudo command not found"
      service "$service" start
    fi
    echo "Started service: $service"
  done
else
  echo "No suitable service manager found" >&2
  exit 1
fi

echo "All services started successfully"