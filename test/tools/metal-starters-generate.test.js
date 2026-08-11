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
  fs.chmodSync(fakeXcrun, 0o755);

  const env = {
    ...process.env,
    PATH: `${fakeBin}:${process.env.PATH}`,
    TMPDIR: sandbox,
    METAL_STARTERS_TEST_LOG: buildLog,
    METAL_STARTERS_FAKE_EXECUTABLE: fakeGenerator,
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

  let concurrentDirectories = [];
  async function concurrentBuildDirectories() {
    const first = path.join(sandbox, 'concurrent-one');
    const second = path.join(sandbox, 'concurrent-two');
    await Promise.all([
      execute(['--character', 'robot', '--output-dir', first]),
      execute(['--character', 'robot', '--output-dir', second]),
    ]);
    concurrentDirectories = fs.readFileSync(buildLog, 'utf8').trim().split('\n');
    return concurrentDirectories.slice(-2);
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
    assert.deepEqual(await generatedNames(['--character', 'robot']), ['robot.glb']);
    assert.deepEqual(await generatedNames(['--all']), [
      'astronaut.glb', 'dinosaur.glb', 'knight.glb', 'ninja.glb', 'princess.glb',
      'puppy.glb', 'robot.glb', 'superhero.glb', 'unicorn.glb', 'wizard.glb',
    ]);
    assert.deepEqual(await outputsAfterForcedFailure(), outputsBeforeForcedFailure);
    assert.equal(new Set(await concurrentBuildDirectories()).size, 2);
    assert.deepEqual(await remainingBuildDirectories(), []);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});
