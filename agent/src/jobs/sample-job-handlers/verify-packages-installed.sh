#!/usr/bin/env sh
set -e

echo "Running verify-packages-installed.sh"
user=$1
shift 1
packages=$@
echo "Username: $user"
echo "Packages to verify: $packages"

if command -v "rpm" > /dev/null; then
  echo "Using RPM package manager"
  for package in $packages
  do
    if id "$user" 2>/dev/null && command -v "sudo" > /dev/null; then
      sudo -u "$user" -n rpm -q "$package"
    else
      echo "username or sudo command not found"
      rpm -q "$package"
    fi
    echo "Package $package is installed"
  done
elif command -v "dpkg" > /dev/null; then
  echo "Using DPKG package manager"
  # Using -s flag instead of -l for dpkg based on https://github.com/bitrise-io/bitrise/issues/433
  for package in $packages
  do
    if id "$user" 2>/dev/null && command -v "sudo" > /dev/null; then
      sudo -u "$user" -n dpkg -s "$package"
    else
      echo "username or sudo command not found"
      dpkg -s "$package"
    fi
    echo "Package $package is installed"
  done
elif command -v "brew" > /dev/null; then
  echo "Using Homebrew package manager"
  for package in $packages
  do
    brew list "$package"
    echo "Package $package is installed"
  done
else
  echo "No suitable package manager found" >&2
  exit 1
fi

echo "All packages verified successfully"