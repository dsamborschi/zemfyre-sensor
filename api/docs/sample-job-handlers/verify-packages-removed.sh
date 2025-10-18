#!/usr/bin/env sh

echo "Running verify-packages-removed.sh"
user=$1
shift 1
packages=$@
echo "Username: $user"
echo "Packages to verify: $packages"

if command -v "rpm" > /dev/null; then
  echo "Using RPM package manager"
  for pkg in $packages
  do
    if id "$user" 2>/dev/null && command -v "sudo" > /dev/null; then
      sudo -u "$user" -n rpm -q "$pkg" 2>/dev/null
    else
      echo "username or sudo command not found"
      rpm -q "$pkg" 2>/dev/null
    fi
    RETVAL=$?
    if [ $RETVAL -eq 0 ]; then
        echo "Package $pkg is still installed - verification failed"
        exit 1
    fi
    echo "Package $pkg is not installed (correctly removed)"
  done
elif command -v "dpkg" > /dev/null; then
  echo "Using DPKG package manager"
  for pkg in $packages
  do
    # Using -s flag instead of -l for dpkg based on https://github.com/bitrise-io/bitrise/issues/433
    if id "$user" 2>/dev/null && command -v "sudo" > /dev/null; then
      sudo -u "$user" -n dpkg -s "$pkg" 2>/dev/null
    else
      echo "username or sudo command not found"
      dpkg -s "$pkg" 2>/dev/null
    fi
    RETVAL=$?
    if [ $RETVAL -eq 0 ]; then
        echo "Package $pkg is still installed - verification failed"
        exit 1
    fi
    echo "Package $pkg is not installed (correctly removed)"
  done
elif command -v "brew" > /dev/null; then
  echo "Using Homebrew package manager"
  for pkg in $packages
  do
    brew list "$pkg" 2>/dev/null
    RETVAL=$?
    if [ $RETVAL -eq 0 ]; then
        echo "Package $pkg is still installed - verification failed"
        exit 1
    fi
    echo "Package $pkg is not installed (correctly removed)"
  done
else
  echo "No suitable method found to determine installed packages" >&2
  exit 1
fi

echo "All packages verified as removed successfully"