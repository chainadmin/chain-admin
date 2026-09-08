#!/bin/bash
set -euo pipefail

# Task merges usually do not change dependencies. Reinstalling on every merge
# needlessly contacts the package registry and can fail when an unrelated
# transitive package is temporarily blocked by the package firewall.
dependency_files=(package.json package-lock.json npm-shrinkwrap.json)
dependencies_changed=false
if git rev-parse --verify HEAD^ >/dev/null 2>&1; then
  if ! git diff --quiet HEAD^ HEAD -- "${dependency_files[@]}"; then
    dependencies_changed=true
  fi
else
  dependencies_changed=true
fi

if [[ ! -d node_modules || "$dependencies_changed" == true ]]; then
  npm install --no-audit --no-fund --prefer-offline
else
  echo "Dependency manifests unchanged; reusing existing node_modules."
fi

# Schema changes are applied by the application's ordered, idempotent migration
# runner when the reconciled workflow starts. Never force-sync the partial
# Drizzle schema here because that can drop tables managed by other schema files.
echo "Database migrations run during application startup."
