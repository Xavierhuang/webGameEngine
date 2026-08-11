#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="$(mktemp -d "${TMPDIR:-/tmp}/lingplay-metal-dragon.XXXXXX")"
trap 'rm -rf "$BUILD_DIR"' EXIT
OUTPUT_PATH="${1:-$SCRIPT_DIR/../../public/models/red-metal-dragon.glb}"
mkdir -p "$(dirname "$OUTPUT_PATH")"
xcrun -sdk macosx metal -c "$SCRIPT_DIR/DragonGenerator.metal" -o "$BUILD_DIR/DragonGenerator.air"
xcrun -sdk macosx metallib "$BUILD_DIR/DragonGenerator.air" -o "$BUILD_DIR/dragon.metallib"
xcrun -sdk macosx swiftc "$SCRIPT_DIR/main.swift" -framework Metal -o "$BUILD_DIR/metal-dragon"
"$BUILD_DIR/metal-dragon" --library "$BUILD_DIR/dragon.metallib" --output "$OUTPUT_PATH"
