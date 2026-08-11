const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);
const expectedIds = ['dinosaur', 'unicorn', 'robot', 'knight', 'wizard',
  'princess', 'astronaut', 'ninja', 'puppy', 'superhero'];

function parseCatalogIds(source) {
  return [...source.matchAll(/StarterCharacter\(\s*id:\s*"([a-z]+)"/g)]
    .map((match) => match[1]);
}

function listFiles(directory) {
  return fs.existsSync(directory) ? fs.readdirSync(directory).sort() : [];
}

function snapshot(directory, metadataFile) {
  return {
    files: listFiles(directory).map((name) => [
      name,
      fs.readFileSync(path.join(directory, name), 'utf8'),
    ]),
    metadata: fs.existsSync(metadataFile) ? fs.readFileSync(metadataFile, 'utf8') : null,
  };
}

test('starter generator has a deterministic catalog and atomic isolated orchestration', {
  skip: process.platform === 'win32' ? 'requires POSIX shell utilities' : false,
}, async () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'lingplay-metal-starters-test-'));
  const fakeBin = path.join(sandbox, 'bin');
  const buildLog = path.join(sandbox, 'build-dirs.log');
  const fakeGenerator = path.join(fakeBin, 'fake-generator');
  const fakeMv = path.join(fakeBin, 'mv');
  const fakeXcrun = path.join(fakeBin, 'xcrun');
  fs.mkdirSync(fakeBin);
  fs.writeFileSync(fakeGenerator, `#!/usr/bin/env bash
set -euo pipefail
mode=''
character=''
output_dir=''
metadata=''
while [ "$#" -gt 0 ]; do
  case "$1" in
    --character) mode='character'; character="$2"; shift 2 ;;
    --all) mode='all'; shift ;;
    --output-dir) output_dir="$2"; shift 2 ;;
    --metadata) metadata="$2"; shift 2 ;;
    --library) shift 2 ;;
    *) printf 'Unexpected fake generator argument: %s\\n' "$1" >&2; exit 64 ;;
  esac
done
mkdir -p "$output_dir"
if [ "$mode" = 'character' ]; then
  printf 'generated:%s\\n' "$character" > "$output_dir/$character.glb"
else
  for id in dinosaur unicorn robot knight wizard princess astronaut ninja puppy superhero; do
    printf 'generated:%s\\n' "$id" > "$output_dir/$id.glb"
    if [ "\${METAL_STARTERS_FORCE_FAILURE:-0}" = '1' ] && [ "$id" = 'robot' ]; then
      printf 'forced generator failure\\n' >&2
      exit 12
    fi
  done
  printf '{"generated":true}\\n' > "$metadata"
fi
`);
  fs.writeFileSync(fakeMv, `#!/usr/bin/env bash
set -euo pipefail
is_publish=0
for argument in "$@"; do
  case "$argument" in */new/*) is_publish=1 ;; esac
done
if [ "$is_publish" = '1' ] && [ -n "\${METAL_STARTERS_FAIL_PUBLISH_AFTER:-}" ]; then
  count=0
  [ ! -f "$METAL_STARTERS_MV_LOG" ] || count="$(cat "$METAL_STARTERS_MV_LOG")"
  count=$((count + 1))
  printf '%s\n' "$count" > "$METAL_STARTERS_MV_LOG"
  if [ "$count" -eq "$METAL_STARTERS_FAIL_PUBLISH_AFTER" ]; then
    printf 'forced publish failure\n' >&2
    exit 73
  fi
fi
exec /bin/mv "$@"
`);
  fs.writeFileSync(fakeXcrun, `#!/usr/bin/env bash
set -euo pipefail
mode=''
output=''
for argument in "$@"; do
  case "$argument" in metal|metallib|swiftc) mode="$argument" ;; esac
done
while [ "$#" -gt 0 ]; do
  if [ "$1" = '-o' ]; then output="$2"; shift 2; else shift; fi
done
mkdir -p "$(dirname "$output")"
if [ "$mode" = 'swiftc' ]; then
  printf '%s\\n' "$(dirname "$output")" >> "$METAL_STARTERS_TEST_LOG"
  ln -sf "$METAL_STARTERS_FAKE_EXECUTABLE" "$output"
else
  : > "$output"
fi
`);
  fs.chmodSync(fakeGenerator, 0o755);
  fs.chmodSync(fakeMv, 0o755);
  fs.chmodSync(fakeXcrun, 0o755);

  const env = {
    ...process.env,
    PATH: `${fakeBin}:${process.env.PATH}`,
    TMPDIR: sandbox,
    METAL_STARTERS_TEST_LOG: buildLog,
    METAL_STARTERS_FAKE_EXECUTABLE: fakeGenerator,
    METAL_STARTERS_MV_LOG: path.join(sandbox, 'mv-count.log'),
  };
  let runNumber = 0;

  async function execute(arguments_, options = {}) {
    try {
      const result = await execFileAsync('bash', [
        'tools/metal-starters/generate.sh',
        ...arguments_,
      ], { env: { ...env, ...options.env } });
      return { code: 0, stdout: result.stdout, stderr: result.stderr };
    } catch (error) {
      return {
        code: typeof error.code === 'number' ? error.code : 127,
        stdout: error.stdout || '',
        stderr: error.stderr || String(error),
      };
    }
  }

  async function run(arguments_) {
    const outputDirectory = path.join(sandbox, `run-${runNumber++}`);
    const metadataFile = path.join(sandbox, `metadata-${runNumber}.json`);
    const result = await execute([
      ...arguments_,
      '--output-dir', outputDirectory,
      ...(arguments_.includes('--all') ? ['--metadata', metadataFile] : []),
    ]);
    return { code: result.code, stderr: result.stderr };
  }

  async function generatedNames(arguments_) {
    const outputDirectory = path.join(sandbox, `generated-${runNumber++}`);
    const metadataFile = path.join(sandbox, `generated-${runNumber}.json`);
    const result = await execute([
      ...arguments_,
      '--output-dir', outputDirectory,
      ...(arguments_.includes('--all') ? ['--metadata', metadataFile] : []),
    ]);
    assert.equal(result.code, 0, result.stderr);
    return listFiles(outputDirectory);
  }

  const failureOutput = path.join(sandbox, 'failure-output');
  const failureMetadata = path.join(sandbox, 'failure-metadata.json');
  fs.mkdirSync(failureOutput);
  fs.writeFileSync(path.join(failureOutput, 'existing.glb'), 'keep me\n');
  fs.writeFileSync(failureMetadata, '{"existing":true}\n');
  const outputsBeforeForcedFailure = snapshot(failureOutput, failureMetadata);

  async function outputsAfterForcedFailure() {
    const result = await execute([
      '--all', '--output-dir', failureOutput, '--metadata', failureMetadata,
    ], { env: { METAL_STARTERS_FORCE_FAILURE: '1' } });
    assert.equal(result.code, 12);
    return snapshot(failureOutput, failureMetadata);
  }

  const publishFailureOutput = path.join(sandbox, 'publish-failure-output');
  const publishFailureMetadata = path.join(sandbox, 'publish-failure-metadata.ts');
  fs.mkdirSync(publishFailureOutput);
  for (const id of expectedIds) {
    fs.writeFileSync(path.join(publishFailureOutput, `${id}.glb`), `previous:${id}\n`);
  }
  fs.writeFileSync(publishFailureMetadata, 'previous metadata\n');
  const outputsBeforePublishFailure = snapshot(publishFailureOutput, publishFailureMetadata);

  async function outputsAfterPublishFailure() {
    fs.rmSync(env.METAL_STARTERS_MV_LOG, { force: true });
    const result = await execute([
      '--all', '--output-dir', publishFailureOutput,
      '--metadata', publishFailureMetadata,
    ], { env: { METAL_STARTERS_FAIL_PUBLISH_AFTER: '4' } });
    assert.equal(result.code, 73, result.stderr);
    return snapshot(publishFailureOutput, publishFailureMetadata);
  }

  function publicationArtifacts() {
    const artifacts = [];
    const pending = [sandbox];
    while (pending.length > 0) {
      const directory = pending.pop();
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const entryPath = path.join(directory, entry.name);
        if (entry.name.startsWith('.lingplay-metal-starters')) {
          artifacts.push(path.relative(sandbox, entryPath));
        }
        if (entry.isDirectory()) pending.push(entryPath);
      }
    }
    return artifacts.sort();
  }

  let concurrentDirectories = [];
  async function concurrentBuildDirectories() {
    const first = path.join(sandbox, 'concurrent-one');
    const second = path.join(sandbox, 'concurrent-two');
    fs.writeFileSync(buildLog, '');
    const results = await Promise.all([
      execute(['--character', 'robot', '--output-dir', first]),
      execute(['--character', 'robot', '--output-dir', second]),
    ]);
    assert.deepEqual(results.map(({ code }) => code), [0, 0]);
    concurrentDirectories = fs.readFileSync(buildLog, 'utf8').trim().split('\n');
    return concurrentDirectories;
  }

  async function remainingBuildDirectories() {
    return concurrentDirectories.filter((directory) => fs.existsSync(directory));
  }

  try {
    assert.deepEqual(await run(['--character', 'spaceship']), {
      code: 1,
      stderr: 'Unknown starter character: spaceship\n',
    });
    const swiftCatalogSource = fs.readFileSync('tools/metal-starters/StarterCatalog.swift', 'utf8');
    assert.deepEqual(parseCatalogIds(swiftCatalogSource), expectedIds);
    const aliasOutput = path.join(sandbox, 'alias-parent', 'starters');
    for (const metadataAlias of [
      path.join(aliasOutput, 'robot.glb'),
      path.join(aliasOutput, '..', 'starters', 'robot.glb'),
    ]) {
      const result = await execute([
        '--all', '--output-dir', aliasOutput, '--metadata', metadataAlias,
      ]);
      const canonicalAlias = path.join(fs.realpathSync(aliasOutput), 'robot.glb');
      assert.deepEqual({ code: result.code, stderr: result.stderr }, {
        code: 1,
        stderr: `Metadata path aliases generated starter output: ${canonicalAlias}\n`,
      });
    }
    assert.equal(fs.existsSync(buildLog), false, 'metadata aliases must fail before compilation');
    assert.deepEqual(await generatedNames(['--character', 'robot']), ['robot.glb']);
    assert.deepEqual(await generatedNames(['--all']), [
      'astronaut.glb', 'dinosaur.glb', 'knight.glb', 'ninja.glb', 'princess.glb',
      'puppy.glb', 'robot.glb', 'superhero.glb', 'unicorn.glb', 'wizard.glb',
    ]);
    assert.deepEqual(await outputsAfterForcedFailure(), outputsBeforeForcedFailure);
    assert.deepEqual(await outputsAfterPublishFailure(), outputsBeforePublishFailure);
    assert.equal(new Set(await concurrentBuildDirectories()).size, 2);
    assert.deepEqual(await remainingBuildDirectories(), []);
    assert.deepEqual(publicationArtifacts(), []);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test('starter geometry validation reports vertex-count overflow without trapping', {
  skip: process.platform !== 'darwin' ? 'requires the macOS Swift and Metal SDKs' : false,
}, async () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'lingplay-metal-overflow-test-'));
  const harness = path.join(sandbox, 'OverflowHarness.swift');
  const executable = path.join(sandbox, 'overflow-test');
  fs.writeFileSync(harness, `import Foundation
import simd

@main
struct OverflowHarness {
  static func main() {
    let character = StarterCharacter(
      id: "overflow",
      displayName: "Overflow",
      description: "Overflow fixture",
      aliases: [],
      defaultSize: 1,
      materials: [StarterMaterial(
        name: "Fixture",
        color: SIMD4(1, 1, 1, 1),
        metallic: 0,
        roughness: 1
      )],
      parts: [StarterPart(
        name: "Overflow",
        center: SIMD3(0, 0, 0),
        radius: SIMD3(1, 1, 1),
        rotation: SIMD3(0, 0, 0),
        rings: UInt32.max,
        segments: UInt32.max,
        material: 0
      )]
    )
    do {
      _ = try generateVertices(
        character: character,
        libraryURL: URL(fileURLWithPath: "/missing.metallib")
      )
      fputs("validation unexpectedly succeeded\\n", stderr)
      exit(2)
    } catch {
      print(error.localizedDescription)
    }
  }
}
`);

  try {
    await execFileAsync('/usr/bin/xcrun', [
      '-sdk', 'macosx', 'swiftc',
      '-module-cache-path', path.join(sandbox, 'swift-cache'),
      'tools/metal-starters/StarterCatalog.swift',
      'tools/metal-starters/GLBWriter.swift',
      harness,
      '-framework', 'Metal',
      '-o', executable,
    ]);
    const result = await execFileAsync(executable);
    assert.equal(result.stdout, 'Part Overflow has too many vertices\n');
    assert.equal(result.stderr, '');
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});
