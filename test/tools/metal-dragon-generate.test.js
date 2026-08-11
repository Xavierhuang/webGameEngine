const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

test('generator uses isolated temporary build directories and removes them', {
  skip: process.platform === 'win32' ? 'requires POSIX shell utilities' : false,
}, async () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'lingplay-metal-dragon-test-'));
  const fakeBin = path.join(sandbox, 'bin');
  const buildLog = path.join(sandbox, 'build-dirs.log');
  const fakeGenerator = path.join(fakeBin, 'fake-generator');
  const fakeXcrun = path.join(fakeBin, 'xcrun');
  fs.mkdirSync(fakeBin);
  fs.writeFileSync(fakeGenerator, `#!/bin/sh
set -eu
output=''
while [ "$#" -gt 0 ]; do
  if [ "$1" = '--output' ]; then output="$2"; shift 2; else shift; fi
done
: > "$output"
`);
  fs.writeFileSync(fakeXcrun, `#!/bin/sh
set -eu
output=''
mode=''
for argument in "$@"; do
  [ "$argument" = 'swiftc' ] && mode='swiftc'
done
while [ "$#" -gt 0 ]; do
  if [ "$1" = '-o' ]; then output="$2"; shift 2; else shift; fi
done
printf '%s\n' "$(dirname "$output")" >> "$METAL_DRAGON_TEST_LOG"
if [ "$mode" = 'swiftc' ]; then
  ln -sf "$METAL_DRAGON_FAKE_EXECUTABLE" "$output"
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
    METAL_DRAGON_TEST_LOG: buildLog,
    METAL_DRAGON_FAKE_EXECUTABLE: fakeGenerator,
  };

  try {
    await Promise.all([
      execFileAsync('bash', ['tools/metal-dragon/generate.sh', path.join(sandbox, 'one.glb')], { env }),
      execFileAsync('bash', ['tools/metal-dragon/generate.sh', path.join(sandbox, 'two.glb')], { env }),
    ]);
    const buildDirectories = fs.readFileSync(buildLog, 'utf8').trim().split('\n');
    const uniqueBuildDirectories = [...new Set(buildDirectories)];
    assert.equal(uniqueBuildDirectories.length, 2, 'concurrent runs must not share a build directory');
    for (const directory of uniqueBuildDirectories) {
      assert.match(path.basename(directory), /^lingplay-metal-dragon\.[A-Za-z0-9]+$/);
      assert.equal(fs.existsSync(directory), false, `${directory} must be removed on exit`);
    }
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});
