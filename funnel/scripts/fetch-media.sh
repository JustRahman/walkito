#!/usr/bin/env bash
# The clips, posters and photos the funnel shows, copied from where the app and
# the site keep them, so they are never committed twice. Run before a build;
# the deploy script runs it.
set -euo pipefail
cd "$(dirname "$0")/.."
REPO=..
URL="${FUNNEL_SUPABASE_URL:-$(grep '^EXPO_PUBLIC_SUPABASE_URL=' "$REPO/.env.local" 2>/dev/null | cut -d= -f2-)}"
mkdir -p public/clips public/posters public/img
cp "$REPO/assets/icon-small.webp" public/img/icon.webp
cp "$REPO/assets/offer/phone-home.webp" public/img/
for art in foot shield calendar star clipboard; do cp "$REPO/assets/onboarding/building/$art.webp" "public/img/art-$art.webp"; done
ids=$(grep -oE "^  [a-z_]+: \{ file: '[^']+'" "$REPO/src/shared/config/clip-manifest.ts" | sed -E "s/^  ([a-z_]+): .*/\1/")
for id in $ids; do
  cp "$REPO/assets/exercise-posters/$id.webp" public/posters/ 2>/dev/null || true
  [ -s "public/clips/$id.mp4" ] && continue
  [ -n "$URL" ] || { echo "fetch-media: no Supabase URL for the clips" >&2; exit 1; }
  file=$(grep -oE "^  $id: \{ file: '[^']+'" "$REPO/src/shared/config/clip-manifest.ts" | sed -E "s/.*file: '([^']+)'/\1/")
  curl -sfo "public/clips/$id.mp4" "$URL/storage/v1/object/public/exercise-clips/$file"
done
echo "fetch-media: $(ls public/clips | wc -l | tr -d ' ') clips, $(ls public/posters | wc -l | tr -d ' ') posters"
