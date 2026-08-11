#!/usr/bin/env bash
set -euo pipefail

usage() {
  printf '%s\n' \
    'Usage: generate.sh --character <id> --output-dir <dir>' \
    '   or: generate.sh --all --output-dir <dir> --metadata <file>' >&2
}

MODE=''
CHARACTER=''
OUTPUT_DIR=''
METADATA_FILE=''

while [ "$#" -gt 0 ]; do
  case "$1" in
    --character)
      [ "$#" -ge 2 ] || { usage; exit 1; }
      [ -z "$MODE" ] || { usage; exit 1; }
      MODE='character'
      CHARACTER="$2"
      shift 2
      ;;
    --all)
      [ -z "$MODE" ] || { usage; exit 1; }
      MODE='all'
      shift
      ;;
    --output-dir)
      [ "$#" -ge 2 ] || { usage; exit 1; }
      OUTPUT_DIR="$2"
      shift 2
      ;;
    --metadata)
      [ "$#" -ge 2 ] || { usage; exit 1; }
      METADATA_FILE="$2"
      shift 2
      ;;
    *)
      usage
      exit 1
      ;;
  esac
done

[ -n "$MODE" ] && [ -n "$OUTPUT_DIR" ] || { usage; exit 1; }
if [ "$MODE" = 'character' ]; then
  [ -z "$METADATA_FILE" ] || { usage; exit 1; }
  case "$CHARACTER" in
    dinosaur|unicorn|robot|knight|wizard|princess|astronaut|ninja|puppy|superhero) ;;
    *)
      printf 'Unknown starter character: %s\n' "$CHARACTER" >&2
      exit 1
      ;;
  esac
else
  [ -n "$METADATA_FILE" ] || { usage; exit 1; }
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="$(mktemp -d "${TMPDIR:-/tmp}/lingplay-metal-starters.XXXXXX")"
cleanup() {
  rm -rf -- "$BUILD_DIR"
}
trap cleanup EXIT

STAGING_OUTPUT_DIR="$BUILD_DIR/output"
STAGING_METADATA="$BUILD_DIR/metadata.json"
mkdir -p "$STAGING_OUTPUT_DIR"

xcrun -sdk macosx metal -c \
  -fmodules-cache-path="$BUILD_DIR/clang-cache" \
  "$SCRIPT_DIR/ProceduralParts.metal" \
  -o "$BUILD_DIR/ProceduralParts.air"
xcrun -sdk macosx metallib \
  "$BUILD_DIR/ProceduralParts.air" \
  -o "$BUILD_DIR/starters.metallib"
xcrun -sdk macosx swiftc \
  -module-cache-path "$BUILD_DIR/swift-cache" \
  "$SCRIPT_DIR/StarterCatalog.swift" \
  "$SCRIPT_DIR/GLBWriter.swift" \
  "$SCRIPT_DIR/main.swift" \
  -framework Metal \
  -o "$BUILD_DIR/metal-starters"

if [ "$MODE" = 'character' ]; then
  "$BUILD_DIR/metal-starters" \
    --character "$CHARACTER" \
    --library "$BUILD_DIR/starters.metallib" \
    --output-dir "$STAGING_OUTPUT_DIR"
  [ -f "$STAGING_OUTPUT_DIR/$CHARACTER.glb" ] || {
    printf 'Generator did not produce %s.glb\n' "$CHARACTER" >&2
    exit 1
  }
  mkdir -p "$OUTPUT_DIR"
  mv -f -- "$STAGING_OUTPUT_DIR/$CHARACTER.glb" "$OUTPUT_DIR/$CHARACTER.glb"
else
  "$BUILD_DIR/metal-starters" \
    --all \
    --library "$BUILD_DIR/starters.metallib" \
    --output-dir "$STAGING_OUTPUT_DIR" \
    --metadata "$STAGING_METADATA"

  for id in dinosaur unicorn robot knight wizard princess astronaut ninja puppy superhero; do
    [ -f "$STAGING_OUTPUT_DIR/$id.glb" ] || {
      printf 'Generator did not produce %s.glb\n' "$id" >&2
      exit 1
    }
  done
  [ -f "$STAGING_METADATA" ] || {
    printf 'Generator did not produce metadata\n' >&2
    exit 1
  }

  mkdir -p "$OUTPUT_DIR" "$(dirname "$METADATA_FILE")"
  for id in dinosaur unicorn robot knight wizard princess astronaut ninja puppy superhero; do
    mv -f -- "$STAGING_OUTPUT_DIR/$id.glb" "$OUTPUT_DIR/$id.glb"
  done
  mv -f -- "$STAGING_METADATA" "$METADATA_FILE"
fi
