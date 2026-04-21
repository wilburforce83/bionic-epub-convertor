const test = require('node:test');
const assert = require('node:assert/strict');

const { compareSemver, parseSemver, pickLatestSemver } = require('../utils/versionUtils');

test('parseSemver accepts plain and v-prefixed semantic versions', () => {
  assert.deepEqual(parseSemver('1.0.8'), {
    major: 1,
    minor: 0,
    patch: 8,
    version: '1.0.8'
  });

  assert.deepEqual(parseSemver('v2.5.0'), {
    major: 2,
    minor: 5,
    patch: 0,
    version: '2.5.0'
  });
});

test('compareSemver orders releases numerically', () => {
  assert.equal(compareSemver('1.0.8', '1.0.7') > 0, true);
  assert.equal(compareSemver('1.2.0', '1.10.0') < 0, true);
  assert.equal(compareSemver('2.0.0', '2.0.0'), 0);
});

test('pickLatestSemver ignores non-release tags and returns the highest exact version', () => {
  assert.equal(
    pickLatestSemver(['latest', '1.0', 'v1.0.8', '1.0.10', 'sha-abcdef', '1.0.9']),
    '1.0.10'
  );

  assert.equal(pickLatestSemver(['latest', 'main']), '');
});
