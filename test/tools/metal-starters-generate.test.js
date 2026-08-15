const assert = require('node:assert/strict');
const { execFile, spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);
// This list is deliberately duplicated from starterCatalog(). It is the guard
// that caught the shell script's hardcoded roster falling behind the Swift
// catalog — --all silently produced 21 of 39 characters until it did.
const expectedIds = ['dinosaur', 'unicorn', 'robot', 'knight', 'wizard',
  'princess', 'astronaut', 'ninja', 'puppy', 'superhero', 'hero',
  'dog', 'cat', 'fish', 'bird', 'alien', 'monster', 'tree', 'rock',
  'ghost', 'dragon',
  'pirate', 'chef', 'doctor', 'explorer', 'queen', 'king', 'witch', 'diver',
  'bear', 'rabbit', 'fox', 'panda', 'tiger', 'penguin', 'owl', 'parrot',
  'shark', 'octopus',
  // Objects, vehicles and small creatures — distinct silhouettes rather than
  // recolours of the existing ten.
  'car', 'rocket', 'boat', 'airplane', 'train', 'spider', 'crab', 'butterfly', 'bee', 'snake', 'frog', 'turtle', 'jellyfish', 'snail', 'house', 'castle', 'mushroom', 'flower', 'star', 'chest'];

function parseCatalogIds(source) {
  return [...source.matchAll(/StarterCharacter\(\s*id:\s*"([a-z]+)"/g)]
    .map((match) => match[1]);
}

function listFiles(directory) {
  return fs.existsSync(directory) ? fs.readdirSync(directory).sort() : [];
}

function snapshot(directory, metadataFile) {
  return {
    files: listFiles(directory)
      .filter((name) => name !== '.lingplay-metal-starters.output.lock')
      .map((name) => [
        name,
        fs.readFileSync(path.join(directory, name), 'utf8'),
      ]),
    metadata: fs.existsSync(metadataFile) ? fs.readFileSync(metadataFile, 'utf8') : null,
  };
}

test('starter generator has a deterministic catalog and atomic isolated orchestration', {
  skip: process.platform !== 'darwin' ? 'requires macOS lockf and POSIX shell utilities' : false,
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
  # Reads the same catalogue the real generator does, so this stub cannot drift
  # from it — which it did, silently, until the roster was collapsed to one
  # source.
  for id in $(grep -oE 'id: "[a-z0-9_]+"' '${path.resolve('tools/metal-starters/StarterCatalog.swift')}' | sed 's/id: "//; s/"//'); do
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
is_restore=0
source_path=''
next_is_source=0
for argument in "$@"; do
  if [ "$next_is_source" = '1' ]; then source_path="$argument"; break; fi
  [ "$argument" != '--' ] || next_is_source=1
done
case "$source_path" in */new/*) is_publish=1 ;; esac
case "$source_path" in */backup/*.glb) is_restore=1 ;; esac
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
if [ "$is_restore" = '1' ] && [ -n "\${METAL_STARTERS_FAIL_RESTORE_NAME:-}" ]; then
  case "$source_path" in
    */backup/"$METAL_STARTERS_FAIL_RESTORE_NAME")
      printf 'forced restore failure for %s\n' "$source_path" >&2
      exit 74
      ;;
  esac
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

  function childEnvironment(options) {
    const childEnv = { ...env, ...options.env };
    for (const name of options.unsetEnv || []) delete childEnv[name];
    return childEnv;
  }

  async function execute(arguments_, options = {}) {
    try {
      const result = await execFileAsync('bash', [
        'tools/metal-starters/generate.sh',
        ...arguments_,
      ], { env: childEnvironment(options), timeout: options.timeout });
      return { code: 0, stdout: result.stdout, stderr: result.stderr };
    } catch (error) {
      return {
        code: typeof error.code === 'number' ? error.code : 127,
        stdout: error.stdout || '',
        stderr: error.stderr || String(error),
      };
    }
  }

  function spawnExecution(arguments_, options = {}) {
    const child = spawn('bash', [
      'tools/metal-starters/generate.sh',
      ...arguments_,
    ], {
      detached: options.detached || false,
      env: childEnvironment(options),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    const completion = new Promise((resolve) => {
      child.on('close', (code, signal) => resolve({ code, signal, stdout, stderr }));
    });
    return { child, completion };
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
    return listFiles(outputDirectory).filter((name) => name.endsWith('.glb'));
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
        if (entry.name.startsWith('.lingplay-metal-starters') &&
            !entry.name.endsWith('.lock')) {
          artifacts.push(path.relative(sandbox, entryPath));
        }
        if (entry.isDirectory()) pending.push(entryPath);
      }
    }
    return artifacts.sort();
  }

  const rollbackFailureOutput = path.join(sandbox, 'rollback-failure-output');
  const rollbackFailureMetadata = path.join(sandbox, 'rollback-failure-metadata.ts');
  fs.mkdirSync(rollbackFailureOutput);
  for (const id of expectedIds) {
    fs.writeFileSync(path.join(rollbackFailureOutput, `${id}.glb`), `previous:${id}\n`);
  }
  fs.writeFileSync(rollbackFailureMetadata, 'previous metadata\n');

  async function verifyRecoverableRollbackFailure() {
    fs.rmSync(env.METAL_STARTERS_MV_LOG, { force: true });
    const result = await execute([
      '--all', '--output-dir', rollbackFailureOutput,
      '--metadata', rollbackFailureMetadata,
    ], { env: {
      METAL_STARTERS_FAIL_PUBLISH_AFTER: '4',
      METAL_STARTERS_FAIL_RESTORE_NAME: 'robot.glb',
    } });
    assert.equal(result.code, 75, result.stderr);
    assert.match(result.stderr, /Rollback failed restoring backup .*\/backup\/robot\.glb to .*\/rollback-failure-output\/robot\.glb\n/);
    assert.match(result.stderr, /Rollback incomplete; recovery artifacts preserved at:/);

    const recoveryDirectories = fs.readdirSync(rollbackFailureOutput)
      .filter((name) => name.startsWith('.lingplay-metal-starters.publish.'));
    assert.equal(recoveryDirectories.length, 1);
    const recoveryDirectory = path.join(rollbackFailureOutput, recoveryDirectories[0]);
    assert.equal(
      fs.readFileSync(path.join(recoveryDirectory, 'backup', 'robot.glb'), 'utf8'),
      'previous:robot\n'
    );
    assert.equal(
      fs.existsSync(path.join(recoveryDirectory, 'journal', 'robot.glb.original')),
      true
    );
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

  async function waitForFile(file) {
    const deadline = Date.now() + 2000;
    while (!fs.existsSync(file)) {
      if (Date.now() >= deadline) throw new Error(`timed out waiting for ${file}`);
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  function fileLineCount(file) {
    if (!fs.existsSync(file)) return 0;
    const contents = fs.readFileSync(file, 'utf8').trim();
    return contents === '' ? 0 : contents.split('\n').length;
  }

  async function waitForLockState(acquireLog, acquireCount, waitLog) {
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline) {
      if (fileLineCount(acquireLog) >= acquireCount) return 'acquired';
      if (fs.existsSync(waitLog)) return 'waiting';
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`timed out waiting for lock state in ${acquireLog} or ${waitLog}`);
  }

  async function waitForLineCount(file, count) {
    const deadline = Date.now() + 2000;
    while (fileLineCount(file) < count) {
      if (Date.now() >= deadline) {
        throw new Error(`timed out waiting for ${count} lines in ${file}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  async function nonblockingLockCode(lockPath) {
    try {
      await execFileAsync('/usr/bin/lockf', [
        '-s', '-t', '0', '-k', lockPath, '/usr/bin/true',
      ]);
      return 0;
    } catch (error) {
      return error.code;
    }
  }

  function killProcessGroup(child) {
    if (child.exitCode !== null || child.signalCode !== null) return;
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  }

  async function verifyConcurrentDualLockOrder({
    name,
    outputDirectory,
    firstMetadata,
    secondMetadata,
    firstEnvironment = {},
    secondEnvironment = {},
    unsetEnv = [],
  }) {
    const firstAcquireLog = path.join(sandbox, `${name}-first-acquires.log`);
    const secondAcquireLog = path.join(sandbox, `${name}-second-acquires.log`);
    const firstWaitLog = path.join(sandbox, `${name}-first-waits.log`);
    const secondWaitLog = path.join(sandbox, `${name}-second-waits.log`);
    const first = spawnExecution([
      '--all', '--output-dir', outputDirectory, '--metadata', firstMetadata,
    ], { detached: true, env: {
      ...firstEnvironment,
      METAL_STARTERS_LOCK_ACQUIRE_LOG: firstAcquireLog,
      METAL_STARTERS_LOCK_WAIT_LOG: firstWaitLog,
      METAL_STARTERS_STOP_AFTER_LOCK: '1',
    }, unsetEnv });
    let second;
    try {
      await waitForLineCount(firstAcquireLog, 1);
      second = spawnExecution([
        '--all', '--output-dir', outputDirectory, '--metadata', secondMetadata,
      ], { detached: true, env: {
        ...secondEnvironment,
        METAL_STARTERS_LOCK_ACQUIRE_LOG: secondAcquireLog,
        METAL_STARTERS_LOCK_WAIT_LOG: secondWaitLog,
        METAL_STARTERS_STOP_AFTER_LOCK: '1',
      }, unsetEnv });

      const secondInitialState = await waitForLockState(
        secondAcquireLog, 1, secondWaitLog
      );
      if (secondInitialState === 'acquired') {
        assert.equal(first.child.kill('SIGCONT'), true);
        assert.equal(second.child.kill('SIGCONT'), true);
        await Promise.all([waitForFile(firstWaitLog), waitForFile(secondWaitLog)]);
        killProcessGroup(first.child);
        killProcessGroup(second.child);
      } else {
        assert.equal(first.child.kill('SIGCONT'), true);
        await waitForLineCount(firstAcquireLog, 2);
        assert.equal(first.child.kill('SIGCONT'), true);
        await waitForLineCount(secondAcquireLog, 1);
        assert.equal(second.child.kill('SIGCONT'), true);
        await waitForLineCount(secondAcquireLog, 2);
        assert.equal(second.child.kill('SIGCONT'), true);
      }

      const results = await Promise.all([first.completion, second.completion]);
      assert.deepEqual(
        results.map(({ code, signal }) => ({ code, signal })),
        [{ code: 0, signal: null }, { code: 0, signal: null }],
        results.map(({ stderr }) => stderr).join('')
      );
    } finally {
      killProcessGroup(first.child);
      if (second) killProcessGroup(second.child);
      await first.completion;
      if (second) await second.completion;
    }
  }

  async function verifyMixedCaseConcurrentPublishers() {
    const outputDirectory = path.join(sandbox, 'mixed-case-lock-output');
    const upperMetadata = path.join(outputDirectory, 'Zoo');
    const lowerMetadata = path.join(outputDirectory, 'zoo');
    fs.mkdirSync(outputDirectory);
    fs.writeFileSync(upperMetadata, 'case probe\n');
    const caseInsensitive = fs.existsSync(lowerMetadata);
    fs.unlinkSync(upperMetadata);
    if (!caseInsensitive) return;
    await verifyConcurrentDualLockOrder({
      name: 'mixed-case',
      outputDirectory,
      firstMetadata: upperMetadata,
      secondMetadata: lowerMetadata,
    });
  }

  async function verifyLocaleIndependentDualLockOrder() {
    const outputDirectory = path.join(sandbox, 'éA');
    const metadataDirectory = path.join(sandbox, 'ÉB');
    const metadataFile = path.join(metadataDirectory, 'catalog.ts');
    fs.mkdirSync(outputDirectory);
    fs.mkdirSync(metadataDirectory);
    await verifyConcurrentDualLockOrder({
      name: 'mixed-locale',
      outputDirectory,
      firstMetadata: metadataFile,
      secondMetadata: metadataFile,
      firstEnvironment: { LANG: 'C' },
      secondEnvironment: { LANG: 'en_US.UTF-8' },
      unsetEnv: ['LC_ALL', 'LC_CTYPE', 'LC_COLLATE'],
    });
  }

  async function verifyBlockedHelperDoesNotInheritFirstLock() {
    const outputDirectory = path.join(sandbox, 'fd-a-output');
    const metadataDirectory = path.join(sandbox, 'fd-z-metadata');
    const metadataFile = path.join(metadataDirectory, 'catalog.ts');
    const acquireLog = path.join(sandbox, 'fd-owner-acquires.log');
    const waitLog = path.join(sandbox, 'fd-owner-waits.log');
    const blockHelperMarker = path.join(sandbox, 'fd-block-helper.marker');
    fs.mkdirSync(outputDirectory);
    fs.mkdirSync(metadataDirectory);
    const firstLock = path.join(
      fs.realpathSync(outputDirectory), '.lingplay-metal-starters.output.lock'
    );
    const secondLock = path.join(
      fs.realpathSync(metadataDirectory),
      '.lingplay-metal-starters.catalog.ts.lock'
    );
    fs.writeFileSync(secondLock, 'persistent lock inode\n');

    const blocker = spawn('/usr/bin/lockf', [
      '-s', '-k', secondLock, '/bin/sleep', '30',
    ], { detached: true, stdio: 'ignore' });
    const blockerCompletion = new Promise((resolve) => {
      blocker.on('close', (code, signal) => resolve({ code, signal }));
    });
    let owner;
    try {
      const blockerDeadline = Date.now() + 2000;
      while (await nonblockingLockCode(secondLock) !== 75) {
        if (Date.now() >= blockerDeadline) {
          throw new Error(`timed out waiting for blocker on ${secondLock}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      owner = spawnExecution([
        '--all', '--output-dir', outputDirectory, '--metadata', metadataFile,
      ], { env: {
        METAL_STARTERS_LOCK_ACQUIRE_LOG: acquireLog,
        METAL_STARTERS_LOCK_BLOCK_HELPER_MARKER: blockHelperMarker,
        METAL_STARTERS_LOCK_WAIT_LOG: waitLog,
      } });
      await waitForLineCount(acquireLog, 1);
      assert.equal(fs.readFileSync(acquireLog, 'utf8').trim(), firstLock);
      await waitForFile(waitLog);
      await waitForFile(blockHelperMarker);
      assert.equal(await nonblockingLockCode(firstLock), 75);

      const ownerExit = new Promise((resolve) => owner.child.once('exit', resolve));
      assert.equal(owner.child.kill('SIGKILL'), true);
      await ownerExit;
      assert.equal(
        blocker.exitCode === null && blocker.signalCode === null,
        true,
        'the unrelated second-lock blocker must remain alive'
      );
      assert.equal(await nonblockingLockCode(secondLock), 75);
      assert.equal(
        await nonblockingLockCode(firstLock),
        0,
        'killing the owner shell must immediately release its first lock'
      );
    } finally {
      if (owner && owner.child.exitCode === null && owner.child.signalCode === null) {
        owner.child.kill('SIGKILL');
      }
      if (blocker.exitCode === null && blocker.signalCode === null) {
        blocker.kill('SIGKILL');
      }
      await blockerCompletion;
      if (owner) await owner.completion;
      for (const directory of [outputDirectory, metadataDirectory]) {
        for (const name of fs.readdirSync(directory)) {
          if (name.startsWith('.lingplay-metal-starters.publish.')) {
            fs.rmSync(path.join(directory, name), { recursive: true, force: true });
          }
        }
      }
    }
  }

  function inodeIdentity(file) {
    const stat = fs.statSync(file);
    return { dev: stat.dev, ino: stat.ino };
  }

  function buildLogContents() {
    return fs.existsSync(buildLog) ? fs.readFileSync(buildLog, 'utf8') : '';
  }

  async function verifyMetadataLockPathsAreRejected() {
    const pathCases = [
      { name: 'direct', spelling: (directory) => (
        path.join(directory, '.lingplay-metal-starters.output.lock')
      ), precreate: false },
      { name: 'normalized', spelling: (directory) => (
        `${directory}/nested/../.lingplay-metal-starters.output.lock`
      ), precreate: true },
      { name: 'case-variant', spelling: (directory) => (
        path.join(directory, '.LINGPLAY-METAL-STARTERS.OUTPUT.LOCK')
      ), precreate: true, requiresCaseInsensitive: true },
    ];

    for (const pathCase of pathCases) {
      const outputDirectory = path.join(
        sandbox, `metadata-output-lock-${pathCase.name}`
      );
      fs.mkdirSync(outputDirectory);
      const outputLock = path.join(
        fs.realpathSync(outputDirectory), '.lingplay-metal-starters.output.lock'
      );
      if (pathCase.precreate) fs.writeFileSync(outputLock, 'persistent lock inode\n');
      const metadataFile = pathCase.spelling(outputDirectory);
      if (pathCase.requiresCaseInsensitive && !fs.existsSync(metadataFile)) continue;
      const beforeInode = pathCase.precreate ? inodeIdentity(outputLock) : null;
      const buildsBefore = buildLogContents();

      const result = await execute([
        '--all', '--output-dir', outputDirectory, '--metadata', metadataFile,
      ]);
      assert.deepEqual({ code: result.code, stderr: result.stderr }, {
        code: 1,
        stderr: `Metadata path aliases publication lock: ${outputLock}\n`,
      });
      assert.equal(buildLogContents(), buildsBefore);
      if (beforeInode) {
        assert.deepEqual(inodeIdentity(outputLock), beforeInode);
      } else {
        assert.equal(fs.existsSync(outputLock), false);
      }
    }
  }

  async function verifyMetadataLockInodesAreRejected() {
    for (const aliasKind of ['output', 'metadata']) {
      const outputDirectory = path.join(sandbox, `metadata-inode-${aliasKind}-output`);
      const metadataDirectory = path.join(sandbox, `metadata-inode-${aliasKind}-target`);
      const metadataFile = path.join(metadataDirectory, 'catalog.ts');
      fs.mkdirSync(outputDirectory);
      fs.mkdirSync(metadataDirectory);
      const outputLock = path.join(
        fs.realpathSync(outputDirectory), '.lingplay-metal-starters.output.lock'
      );
      const metadataLock = path.join(
        fs.realpathSync(metadataDirectory),
        '.lingplay-metal-starters.catalog.ts.lock'
      );
      const aliasedLock = aliasKind === 'output' ? outputLock : metadataLock;
      fs.writeFileSync(aliasedLock, 'persistent lock inode\n');
      fs.linkSync(aliasedLock, metadataFile);
      const beforeInode = inodeIdentity(aliasedLock);
      const buildsBefore = buildLogContents();

      const result = await execute([
        '--all', '--output-dir', outputDirectory, '--metadata', metadataFile,
      ]);
      assert.deepEqual({ code: result.code, stderr: result.stderr }, {
        code: 1,
        stderr: `Metadata path aliases publication lock: ${aliasedLock}\n`,
      });
      assert.equal(buildLogContents(), buildsBefore);
      assert.deepEqual(inodeIdentity(aliasedLock), beforeInode);
    }
  }

  async function verifySuccessfulPublicationPreservesLockInodes() {
    const outputDirectory = path.join(sandbox, 'persistent-lock-output');
    const metadataDirectory = path.join(sandbox, 'persistent-lock-metadata');
    const metadataFile = path.join(metadataDirectory, 'catalog.ts');
    const arguments_ = [
      '--all', '--output-dir', outputDirectory, '--metadata', metadataFile,
    ];
    const first = await execute(arguments_);
    assert.equal(first.code, 0, first.stderr);
    const outputLock = path.join(
      fs.realpathSync(outputDirectory), '.lingplay-metal-starters.output.lock'
    );
    const metadataLock = path.join(
      fs.realpathSync(metadataDirectory),
      '.lingplay-metal-starters.catalog.ts.lock'
    );
    const before = {
      output: inodeIdentity(outputLock),
      metadata: inodeIdentity(metadataLock),
    };

    const second = await execute(arguments_);
    assert.equal(second.code, 0, second.stderr);
    assert.deepEqual({
      output: inodeIdentity(outputLock),
      metadata: inodeIdentity(metadataLock),
    }, before);
  }

  async function verifyAdvisoryLockSerialization() {
    const outputDirectory = path.join(sandbox, 'atomic-lock-output');
    const marker = path.join(sandbox, 'atomic-lock.marker');
    const waitLog = path.join(sandbox, 'live-lock-waits.log');
    const first = spawnExecution([
      '--character', 'robot', '--output-dir', outputDirectory,
    ], { env: {
      METAL_STARTERS_LOCK_ACQUIRED_MARKER: marker,
      METAL_STARTERS_STOP_AFTER_LOCK: '1',
    } });
    try {
      await waitForFile(marker);
      const lockPath = path.join(outputDirectory, '.lingplay-metal-starters.output.lock');
      assert.equal(fs.lstatSync(lockPath).isFile(), true);
      const second = execute([
        '--character', 'robot', '--output-dir', outputDirectory,
      ], { env: { METAL_STARTERS_LOCK_WAIT_LOG: waitLog } });
      await waitForFile(waitLog);
      assert.equal(first.child.kill('SIGCONT'), true);
      const [firstResult, secondResult] = await Promise.all([first.completion, second]);
      assert.deepEqual(
        [firstResult.code, secondResult.code],
        [0, 0],
        firstResult.stderr || secondResult.stderr
      );
      assert.match(fs.readFileSync(waitLog, 'utf8'), /\.lingplay-metal-starters\.output\.lock/);
      assert.equal(fs.lstatSync(lockPath).isFile(), true);
    } finally {
      if (first.child.exitCode === null && first.child.signalCode === null) {
        first.child.kill('SIGKILL');
      }
      await first.completion;
    }
  }

  async function verifyLegacyOwnerSymlinksFailClosed() {
    const outputDirectory = path.join(sandbox, 'legacy-symlink-lock-output');
    fs.mkdirSync(outputDirectory);
    const lockPath = path.join(outputDirectory, '.lingplay-metal-starters.output.lock');
    const canonicalLock = path.join(
      fs.realpathSync(outputDirectory),
      '.lingplay-metal-starters.output.lock'
    );
    for (const owner of ['99999999', 'not-a-pid']) {
      fs.symlinkSync(owner, lockPath);
      const result = await execute([
        '--character', 'robot', '--output-dir', outputDirectory,
      ], { timeout: 1500 });
      assert.deepEqual({ code: result.code, stderr: result.stderr }, {
        code: 77,
        stderr: `Publication lock path must be a persistent regular file; remove it manually after confirming no publisher is active: ${canonicalLock}\n`,
      });
      assert.equal(fs.lstatSync(lockPath).isSymbolicLink(), true);
      assert.equal(fs.readlinkSync(lockPath), owner);
      fs.unlinkSync(lockPath);
    }
  }

  async function verifyNonRegularLockFailsClosed() {
    const outputDirectory = path.join(sandbox, 'foreign-lock-output');
    fs.mkdirSync(outputDirectory);
    const lockPath = path.join(outputDirectory, '.lingplay-metal-starters.output.lock');
    fs.mkdirSync(lockPath);
    const result = await execute([
      '--character', 'robot', '--output-dir', outputDirectory,
    ], { timeout: 1500 });
    const canonicalLock = path.join(
      fs.realpathSync(outputDirectory),
      '.lingplay-metal-starters.output.lock'
    );
    assert.deepEqual({ code: result.code, stderr: result.stderr }, {
      code: 77,
      stderr: `Publication lock path must be a persistent regular file; remove it manually after confirming no publisher is active: ${canonicalLock}\n`,
    });
    assert.equal(fs.lstatSync(lockPath).isDirectory(), true);
    fs.rmdirSync(lockPath);
  }

  async function verifyHardlinkedLockFailsClosed() {
    const outputDirectory = path.join(sandbox, 'hardlinked-lock-output');
    fs.mkdirSync(outputDirectory);
    const lockPath = path.join(outputDirectory, '.lingplay-metal-starters.output.lock');
    const aliasPath = path.join(sandbox, 'hardlinked-lock-alias');
    fs.writeFileSync(lockPath, 'persistent lock inode\n');
    fs.linkSync(lockPath, aliasPath);
    const result = await execute([
      '--character', 'robot', '--output-dir', outputDirectory,
    ], { timeout: 1500 });
    const canonicalLock = path.join(
      fs.realpathSync(outputDirectory),
      '.lingplay-metal-starters.output.lock'
    );
    assert.deepEqual({ code: result.code, stderr: result.stderr }, {
      code: 77,
      stderr: `Publication lock file has multiple hard links; remove aliases manually after confirming no publisher is active: ${canonicalLock}\n`,
    });
    assert.equal(fs.statSync(lockPath).nlink, 2);
    fs.unlinkSync(aliasPath);
    fs.unlinkSync(lockPath);
  }

  async function verifyOwnedLockSignalAndErrorCleanup() {
    for (const [environment, expectedCode] of [
      [{ METAL_STARTERS_SIGNAL_AFTER_LOCK: '1' }, 143],
      [{ METAL_STARTERS_FAIL_AFTER_LOCK: '1' }, 76],
    ]) {
      const outputDirectory = path.join(sandbox, `owned-lock-cleanup-${expectedCode}`);
      const result = await execute([
        '--character', 'robot', '--output-dir', outputDirectory,
      ], { env: environment });
      assert.equal(result.code, expectedCode, result.stderr);
      const lockPath = path.join(outputDirectory, '.lingplay-metal-starters.output.lock');
      assert.equal(fs.lstatSync(lockPath).isFile(), true);
      const recovery = await execute([
        '--character', 'robot', '--output-dir', outputDirectory,
      ], { timeout: 1500 });
      assert.equal(recovery.code, 0, recovery.stderr);
    }
  }

  async function verifyKernelLockReleaseAfterOwnerDeath() {
    const outputDirectory = path.join(sandbox, 'owner-death-output');
    const marker = path.join(sandbox, 'owner-death.marker');
    const lockPath = path.join(outputDirectory, '.lingplay-metal-starters.output.lock');
    const owner = spawnExecution([
      '--character', 'robot', '--output-dir', outputDirectory,
    ], { env: {
      METAL_STARTERS_LOCK_ACQUIRED_MARKER: marker,
      METAL_STARTERS_STOP_AFTER_LOCK: '1',
    } });
    try {
      await waitForFile(marker);
      assert.equal(fs.lstatSync(lockPath).isFile(), true);

      let contentionCode = 0;
      try {
        await execFileAsync('/usr/bin/lockf', [
          '-s', '-t', '0', '-k', lockPath, '/usr/bin/true',
        ]);
      } catch (error) {
        contentionCode = error.code;
      }
      assert.equal(contentionCode, 75, 'the stopped publisher must still own the kernel lock');

      assert.equal(owner.child.kill('SIGKILL'), true);
      const ownerResult = await owner.completion;
      assert.deepEqual(
        { code: ownerResult.code, signal: ownerResult.signal },
        { code: null, signal: 'SIGKILL' },
        ownerResult.stderr
      );

      const successor = await execute([
        '--character', 'robot', '--output-dir', outputDirectory,
      ], { timeout: 1500 });
      assert.equal(successor.code, 0, successor.stderr);
      assert.equal(fs.lstatSync(lockPath).isFile(), true);

      for (const name of fs.readdirSync(outputDirectory)) {
        if (name.startsWith('.lingplay-metal-starters.publish.')) {
          fs.rmSync(path.join(outputDirectory, name), { recursive: true, force: true });
        }
      }
    } finally {
      if (owner.child.exitCode === null && owner.child.signalCode === null) {
        owner.child.kill('SIGKILL');
      }
      await owner.completion;
    }
  }

  async function verifyCanonicalDualLockAcquisitionOrder() {
    const outputDirectory = path.join(sandbox, 'z-output');
    const metadataDirectory = path.join(sandbox, 'a-metadata');
    const metadataFile = path.join(metadataDirectory, 'output');
    const acquisitionLog = path.join(sandbox, 'dual-lock-order.log');
    const result = await execute([
      '--all', '--output-dir', outputDirectory, '--metadata', metadataFile,
    ], { env: { METAL_STARTERS_LOCK_ACQUIRE_LOG: acquisitionLog } });
    assert.equal(result.code, 0, result.stderr);
    const expectedLocks = [
      path.join(fs.realpathSync(metadataDirectory), '.lingplay-metal-starters.output.lock'),
      path.join(fs.realpathSync(outputDirectory), '.lingplay-metal-starters.output.lock'),
    ].sort();
    assert.deepEqual(
      fs.readFileSync(acquisitionLog, 'utf8').trim().split('\n'),
      expectedLocks
    );
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
      path.join(aliasOutput, 'ROBOT.glb'),
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
    // This list stays written out by hand ON PURPOSE. The script and its stub
    // both read the roster from StarterCatalog.swift now, so deriving this
    // expectation from the catalogue as well would compare the generator
    // against itself and assert nothing. Updating it when a character is added
    // is the point: it is the independent check that --all emitted what the
    // catalogue promised.
    assert.deepEqual(await generatedNames(['--all']), [
      'airplane.glb', 'alien.glb', 'astronaut.glb', 'bear.glb', 'bee.glb',
      'bird.glb', 'boat.glb', 'butterfly.glb', 'car.glb', 'castle.glb',
      'cat.glb', 'chef.glb', 'chest.glb', 'crab.glb', 'dinosaur.glb',
      'diver.glb', 'doctor.glb', 'dog.glb', 'dragon.glb', 'explorer.glb',
      'fish.glb', 'flower.glb', 'fox.glb', 'frog.glb', 'ghost.glb',
      'hero.glb', 'house.glb', 'jellyfish.glb', 'king.glb', 'knight.glb',
      'monster.glb', 'mushroom.glb', 'ninja.glb', 'octopus.glb', 'owl.glb',
      'panda.glb', 'parrot.glb', 'penguin.glb', 'pirate.glb', 'princess.glb',
      'puppy.glb', 'queen.glb', 'rabbit.glb', 'robot.glb', 'rock.glb',
      'rocket.glb', 'shark.glb', 'snail.glb', 'snake.glb', 'spider.glb',
      'star.glb', 'superhero.glb', 'tiger.glb', 'train.glb', 'tree.glb',
      'turtle.glb', 'unicorn.glb', 'witch.glb', 'wizard.glb'
    ]);
    assert.deepEqual(await outputsAfterForcedFailure(), outputsBeforeForcedFailure);
    assert.deepEqual(await outputsAfterPublishFailure(), outputsBeforePublishFailure);
    assert.equal(new Set(await concurrentBuildDirectories()).size, 2);
    assert.deepEqual(await remainingBuildDirectories(), []);
    assert.deepEqual(publicationArtifacts(), []);
    await verifyKernelLockReleaseAfterOwnerDeath();
    await verifyAdvisoryLockSerialization();
    await verifyLegacyOwnerSymlinksFailClosed();
    await verifyNonRegularLockFailsClosed();
    await verifyHardlinkedLockFailsClosed();
    await verifyOwnedLockSignalAndErrorCleanup();
    await verifyCanonicalDualLockAcquisitionOrder();
    await verifyMixedCaseConcurrentPublishers();
    await verifyLocaleIndependentDualLockOrder();
    await verifyBlockedHelperDoesNotInheritFirstLock();
    await verifyMetadataLockPathsAreRejected();
    await verifyMetadataLockInodesAreRejected();
    await verifySuccessfulPublicationPreservesLockInodes();
    assert.deepEqual(publicationArtifacts(), []);
    await verifyRecoverableRollbackFailure();
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
