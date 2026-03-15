#!/bin/bash
# Convert WFS vector layers to PMTiles for Vercel Blob
# Prerequisites: brew install tippecanoe gdal, npm i -g vercel
#
# Before running:
#   1. Create a Blob store in Vercel Dashboard > Storage
#   2. Link it to your project: vercel link
#   3. Pull env vars: vercel env pull .env.local
#      (this sets BLOB_READ_WRITE_TOKEN)
set -euo pipefail

WORK_DIR="$(mktemp -d)"
WFS_BASE="https://opendata.maps.vic.gov.au/geoserver/wfs"
echo "Working in $WORK_DIR"

convert_layer() {
  local type_name="$1"
  local output_name="$2"
  local layer_name="$3"

  echo "=== Processing $output_name ==="

  # 1. Download full dataset via WFS (paginated)
  echo "Downloading $type_name..."
  ogr2ogr -f GeoJSON "$WORK_DIR/$output_name.geojson" \
    "WFS:$WFS_BASE" "$type_name" \
    --config OGR_WFS_PAGE_SIZE 10000

  # 2. Convert to PMTiles with tippecanoe
  echo "Converting to PMTiles..."
  tippecanoe \
    -o "$WORK_DIR/$output_name.pmtiles" \
    -zg \
    --drop-densest-as-needed \
    -l "$layer_name" \
    "$WORK_DIR/$output_name.geojson"

  # 3. Upload to Vercel Blob
  echo "Uploading to Vercel Blob..."
  node -e "
  const { put } = require('@vercel/blob');
  const fs = require('fs');
  (async () => {
    const file = fs.readFileSync('$WORK_DIR/$output_name.pmtiles');
    const { url } = await put('$output_name.pmtiles', file, { access: 'public', addRandomSuffix: false });
    console.log('$output_name uploaded to:', url);
  })();
  "

  echo "$output_name done!"
}

# Convert priority layers
convert_layer "open-data-platform:nv2005_evcbcs" "evc" "evc"
convert_layer "open-data-platform:plantation" "plantation" "plantation"

echo ""
echo "All done! Set these env vars in Vercel:"
echo "  NEXT_PUBLIC_BLOB_URL=https://<your-blob-store>.public.blob.vercel-storage.com"
echo "  NEXT_PUBLIC_USE_PMTILES=true"
echo ""
echo "Cleaning up..."
rm -rf "$WORK_DIR"
