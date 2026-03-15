#!/bin/bash
# Prepare Victorian Land Cover raster as PMTiles for Vercel Blob
# Prerequisites: brew install gdal, pip install rio-pmtiles, npm i -g vercel
#
# Before running:
#   1. Create a Blob store in Vercel Dashboard > Storage
#   2. Link it to your project: vercel link
#   3. Pull env vars: vercel env pull .env.local
#      (this sets BLOB_READ_WRITE_TOKEN)
set -euo pipefail

WORK_DIR="$(mktemp -d)"
echo "Working in $WORK_DIR"

# 1. Download VLUIS Land Cover GeoTIFF (2021-22) from PANGAEA
echo "Downloading land cover data from PANGAEA..."
curl -L -o "$WORK_DIR/vluis.zip" \
  "https://download.pangaea.de/dataset/973963/files/2021_22_VLUIS_LandCover_Victoria.zip"

# 2. Extract
echo "Extracting..."
unzip -o "$WORK_DIR/vluis.zip" -d "$WORK_DIR/vluis"
TIFF=$(find "$WORK_DIR/vluis" -name "*.tif" -o -name "*.TIF" | head -1)

if [ -z "$TIFF" ]; then
  echo "ERROR: No GeoTIFF found in archive"
  exit 1
fi

echo "Found: $TIFF"

# 3. Convert to Cloud-Optimised GeoTIFF
echo "Converting to COG..."
gdal_translate -of COG -co COMPRESS=DEFLATE "$TIFF" "$WORK_DIR/land-cover-cog.tif"

# 4. Convert to PMTiles
echo "Converting to PMTiles..."
rio pmtiles "$WORK_DIR/land-cover-cog.tif" "$WORK_DIR/land-cover.pmtiles" \
  --zoom-levels 4..14 --format PNG --resampling nearest

# 5. Upload to Vercel Blob
echo "Uploading to Vercel Blob..."
node -e "
const { put } = require('@vercel/blob');
const fs = require('fs');
(async () => {
  const file = fs.readFileSync('$WORK_DIR/land-cover.pmtiles');
  const { url } = await put('land-cover.pmtiles', file, { access: 'public', addRandomSuffix: false });
  console.log('Uploaded to:', url);
  console.log('Set NEXT_PUBLIC_BLOB_URL to the base URL (without filename)');
})();
"

echo "Cleaning up..."
rm -rf "$WORK_DIR"
echo "Done!"
