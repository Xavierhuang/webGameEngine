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

mkdir -p "$OUTPUT_DIR"
OUTPUT_DIR="$(cd "$OUTPUT_DIR" && pwd -P)"
if [ "$MODE" = 'all' ]; then
  METADATA_PARENT="$(dirname "$METADATA_FILE")"
  METADATA_BASENAME="$(basename "$METADATA_FILE")"
  mkdir -p "$METADATA_PARENT"
  METADATA_PARENT="$(cd "$METADATA_PARENT" && pwd -P)"
  if [ -e "$METADATA_PARENT/$METADATA_BASENAME" ] || [ -L "$METADATA_PARENT/$METADATA_BASENAME" ]; then
    METADATA_FILE="$(realpath "$METADATA_PARENT/$METADATA_BASENAME")"
  else
    METADATA_FILE="$METADATA_PARENT/$METADATA_BASENAME"
  fi
  METADATA_PARENT="$(dirname "$METADATA_FILE")"
  METADATA_BASENAME="$(basename "$METADATA_FILE")"
  for id in dinosaur unicorn robot knight wizard princess astronaut ninja puppy superhero; do
    if [ "$METADATA_FILE" = "$OUTPUT_DIR/$id.glb" ]; then
      printf 'Metadata path aliases generated starter output: %s\n' "$METADATA_FILE" >&2
      exit 1
    fi
  done
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR=''
OUTPUT_TRANSACTION_DIR=''
METADATA_TRANSACTION_DIR=''
TRANSACTION_ACTIVE=0
LOCK_DIRECTORIES=()
TARGETS=()
NEW_FILES=()
BACKUPS=()
ORIGINAL_MARKERS=()
ABSENT_MARKERS=()

release_locks() {
  local index
  for ((index = ${#LOCK_DIRECTORIES[@]} - 1; index >= 0; index--)); do
    rm -f -- "${LOCK_DIRECTORIES[$index]}/owner"
    rmdir -- "${LOCK_DIRECTORIES[$index]}" 2>/dev/null || true
  done
  LOCK_DIRECTORIES=()
}

rollback_publication() {
  local index target backup original_marker absent_marker
  set +e
  for ((index = ${#TARGETS[@]} - 1; index >= 0; index--)); do
    target="${TARGETS[$index]}"
    backup="${BACKUPS[$index]}"
    original_marker="${ORIGINAL_MARKERS[$index]}"
    absent_marker="${ABSENT_MARKERS[$index]}"
    if [ -e "$backup" ] || [ -L "$backup" ]; then
      rm -f -- "$target"
      mv -f -- "$backup" "$target"
    elif [ -f "$absent_marker" ]; then
      rm -f -- "$target"
    elif [ -f "$original_marker" ]; then
      : # The original target was recorded but had not moved yet.
    fi
  done
}

cleanup() {
  local status="$?"
  trap - EXIT HUP INT TERM
  if [ "$TRANSACTION_ACTIVE" -eq 1 ]; then
    rollback_publication
  fi
  release_locks
  [ -z "$OUTPUT_TRANSACTION_DIR" ] || rm -rf -- "$OUTPUT_TRANSACTION_DIR"
  [ -z "$METADATA_TRANSACTION_DIR" ] || rm -rf -- "$METADATA_TRANSACTION_DIR"
  [ -z "$BUILD_DIR" ] || rm -rf -- "$BUILD_DIR"
  exit "$status"
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

acquire_lock() {
  local lock_directory="$1" owner=''
  while ! mkdir -- "$lock_directory" 2>/dev/null; do
    if [ -f "$lock_directory/owner" ]; then
      owner="$(sed -n '1p' "$lock_directory/owner" 2>/dev/null || true)"
      if [ -n "$owner" ] && ! kill -0 "$owner" 2>/dev/null; then
        rm -f -- "$lock_directory/owner"
        rmdir -- "$lock_directory" 2>/dev/null || true
        continue
      fi
    fi
    sleep 0.05
  done
  printf '%s\n' "$$" > "$lock_directory/owner"
  LOCK_DIRECTORIES+=("$lock_directory")
}

register_target() {
  local target="$1" new_file="$2" backup="$3" journal="$4"
  TARGETS+=("$target")
  NEW_FILES+=("$new_file")
  BACKUPS+=("$backup")
  ORIGINAL_MARKERS+=("$journal.original")
  ABSENT_MARKERS+=("$journal.absent")
}

# POSIX filesystems cannot atomically swap this multi-path set. These locks
# serialize cooperating publishers, and every target is staged/backed up on
# its destination filesystem so handled errors/signals before the final rename
# roll the complete set back. SIGKILL, power loss, and unlocked readers during
# the rename window are outside that guarantee.
publish_transaction() {
  local output_lock metadata_lock first_lock second_lock index target backup
  output_lock="$OUTPUT_DIR/.lingplay-metal-starters.output.lock"
  if [ "$MODE" = 'all' ]; then
    metadata_lock="$METADATA_PARENT/.lingplay-metal-starters.$METADATA_BASENAME.lock"
    if [[ "$output_lock" < "$metadata_lock" ]]; then
      first_lock="$output_lock"; second_lock="$metadata_lock"
    else
      first_lock="$metadata_lock"; second_lock="$output_lock"
    fi
    acquire_lock "$first_lock"
    [ "$second_lock" = "$first_lock" ] || acquire_lock "$second_lock"
  else
    acquire_lock "$output_lock"
  fi

  TRANSACTION_ACTIVE=1
  for ((index = 0; index < ${#TARGETS[@]}; index++)); do
    target="${TARGETS[$index]}"
    if [ -e "$target" ] || [ -L "$target" ]; then
      : > "${ORIGINAL_MARKERS[$index]}"
    else
      : > "${ABSENT_MARKERS[$index]}"
    fi
  done
  for ((index = 0; index < ${#TARGETS[@]}; index++)); do
    target="${TARGETS[$index]}"
    backup="${BACKUPS[$index]}"
    if [ -f "${ORIGINAL_MARKERS[$index]}" ]; then
      mv -f -- "$target" "$backup"
    fi
  done
  for ((index = 0; index < ${#TARGETS[@]}; index++)); do
    mv -f -- "${NEW_FILES[$index]}" "${TARGETS[$index]}"
  done

  TRANSACTION_ACTIVE=0
  rm -rf -- "$OUTPUT_TRANSACTION_DIR"
  OUTPUT_TRANSACTION_DIR=''
  if [ -n "$METADATA_TRANSACTION_DIR" ]; then
    rm -rf -- "$METADATA_TRANSACTION_DIR"
    METADATA_TRANSACTION_DIR=''
  fi
  release_locks
}

BUILD_DIR="$(mktemp -d "${TMPDIR:-/tmp}/lingplay-metal-starters.XXXXXX")"

STAGING_OUTPUT_DIR="$BUILD_DIR/output"
STAGING_METADATA="$BUILD_DIR/metadata.ts"
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
  OUTPUT_TRANSACTION_DIR="$(mktemp -d "$OUTPUT_DIR/.lingplay-metal-starters.publish.XXXXXX")"
  mkdir -p "$OUTPUT_TRANSACTION_DIR/new" "$OUTPUT_TRANSACTION_DIR/backup" "$OUTPUT_TRANSACTION_DIR/journal"
  cp -- "$STAGING_OUTPUT_DIR/$CHARACTER.glb" "$OUTPUT_TRANSACTION_DIR/new/$CHARACTER.glb"
  register_target \
    "$OUTPUT_DIR/$CHARACTER.glb" \
    "$OUTPUT_TRANSACTION_DIR/new/$CHARACTER.glb" \
    "$OUTPUT_TRANSACTION_DIR/backup/$CHARACTER.glb" \
    "$OUTPUT_TRANSACTION_DIR/journal/$CHARACTER.glb"
  publish_transaction
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

  OUTPUT_TRANSACTION_DIR="$(mktemp -d "$OUTPUT_DIR/.lingplay-metal-starters.publish.XXXXXX")"
  METADATA_TRANSACTION_DIR="$(mktemp -d "$METADATA_PARENT/.lingplay-metal-starters.publish.XXXXXX")"
  mkdir -p "$OUTPUT_TRANSACTION_DIR/new" "$OUTPUT_TRANSACTION_DIR/backup" "$OUTPUT_TRANSACTION_DIR/journal"
  mkdir -p "$METADATA_TRANSACTION_DIR/new" "$METADATA_TRANSACTION_DIR/backup" "$METADATA_TRANSACTION_DIR/journal"
  for id in dinosaur unicorn robot knight wizard princess astronaut ninja puppy superhero; do
    cp -- "$STAGING_OUTPUT_DIR/$id.glb" "$OUTPUT_TRANSACTION_DIR/new/$id.glb"
    register_target \
      "$OUTPUT_DIR/$id.glb" \
      "$OUTPUT_TRANSACTION_DIR/new/$id.glb" \
      "$OUTPUT_TRANSACTION_DIR/backup/$id.glb" \
      "$OUTPUT_TRANSACTION_DIR/journal/$id.glb"
  done
  cp -- "$STAGING_METADATA" "$METADATA_TRANSACTION_DIR/new/$METADATA_BASENAME"
  register_target \
    "$METADATA_FILE" \
    "$METADATA_TRANSACTION_DIR/new/$METADATA_BASENAME" \
    "$METADATA_TRANSACTION_DIR/backup/$METADATA_BASENAME" \
    "$METADATA_TRANSACTION_DIR/journal/$METADATA_BASENAME"
  publish_transaction
fi
