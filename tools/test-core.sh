#!/usr/bin/env bash
#
# The test suite, minus the parts that need art this repository does not ship.
#
# `bun test src packages` is still the real suite and is what you should run
# locally. It reports twenty-eight failures on a fresh clone, all of them
# asset-integrity tests correctly observing that the models and audio are not
# here - see docs/assets.md.
#
# CI runs this instead, so that a red badge means a real regression rather than
# a permanent, expected condition. Fetch the packs and `bun test src packages`
# is green too, at which point this script has no reason to exist.
#
# Bun's runner has no exclude flag, so the exclusion is done by listing.
set -euo pipefail
cd "$(dirname "$0")/.."

# Every suite that reads a model, a texture or a sound off disk that this
# repository does not ship. The dummy body IS shipped (tools/make-dummy.ts), so
# the suites that only need a rig are not listed here - they run, and they pass.
EXCLUDE=(
  packages/xp/src/assets/catalogue.test.ts
  packages/xp/src/assets/sounds.test.ts
  src/app/xp/_editor/animator/rig.test.ts
  src/app/xp/_runtime/body/motion.test.ts
  src/app/xp/_runtime/clips.test.ts
  src/domain/animator/presets.test.ts
  src/app/xp/_editor/animator/presets.test.ts
  src/app/xp/_runtime/body/layers.test.ts
  src/app/xp/_runtime/body/skinned.test.ts
  src/domain/builder/catalogue.test.ts
  src/lib/audio/catalogue.test.ts
)

# Drift is loud rather than silent: if one of these is renamed, this fails
# here instead of quietly running a suite CI was meant to skip - or quietly
# skipping nothing at all.
for f in "${EXCLUDE[@]}"; do
  [ -f "$f" ] || { echo "test-core.sh: no such file: $f" >&2; exit 1; }
done

# `mapfile` is bash 4; macOS ships 3.2, and this has to run on both.
KEEP=()
while IFS= read -r f; do
  skip=
  for e in "${EXCLUDE[@]}"; do [ "$f" = "$e" ] && skip=1 && break; done
  [ -z "$skip" ] && KEEP+=("$f")
done < <(find src packages \( -name '*.test.ts' -o -name '*.test.tsx' \) | sort)

echo "running ${#KEEP[@]} test files (${#EXCLUDE[@]} asset suites excluded)"
exec bun test "${KEEP[@]}"
