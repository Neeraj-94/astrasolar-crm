#!/usr/bin/env bash
# One-off git setup for astrasolar-v2 -> astrasolar-crm on GitHub.
#
# Usage:
#   1. On github.com, create a new PRIVATE empty repo named "astrasolar-crm"
#      (no README, no .gitignore, no license).
#   2. Copy the SSH or HTTPS clone URL.
#   3. From this folder, run:
#        bash setup-git.sh git@github.com:YOUR-USERNAME/astrasolar-crm.git
#      or:
#        bash setup-git.sh https://github.com/YOUR-USERNAME/astrasolar-crm.git

set -euo pipefail

REMOTE_URL="${1:-}"
if [ -z "$REMOTE_URL" ]; then
  echo "ERROR: Pass the GitHub remote URL as the first argument."
  echo "Example: bash setup-git.sh git@github.com:neeraj/astrasolar-crm.git"
  exit 1
fi

cd "$(dirname "$0")"

# Clean up any partial .git left from a previous attempt.
if [ -d .git ]; then
  echo "Removing existing .git directory..."
  rm -rf .git
fi

echo "Initializing git repo on branch 'main'..."
git init -b main

git config user.name  "Neeraj"
git config user.email "neeraj@astrasolar.com.au"

echo "Staging files (respecting .gitignore)..."
git add .

echo "Creating initial commit..."
git commit -m "Initial commit: Astrasolar CRM scaffold with Next.js, Tailwind, Prisma, Firebase auth"

echo "Adding remote 'origin' -> $REMOTE_URL"
git remote add origin "$REMOTE_URL"

echo "Pushing to origin/main..."
git push -u origin main

echo ""
echo "Done. Repo is live at: $REMOTE_URL"
