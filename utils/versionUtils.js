function parseSemver(value) {
  const match = String(value || '').trim().match(/^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
  if (!match) {
    return null;
  }

  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3], 10),
    version: `${match[1]}.${match[2]}.${match[3]}`
  };
}

function compareSemver(left, right) {
  const leftVersion = parseSemver(left);
  const rightVersion = parseSemver(right);

  if (!leftVersion || !rightVersion) {
    throw new Error('Expected semantic versions in x.y.z format.');
  }

  if (leftVersion.major !== rightVersion.major) {
    return leftVersion.major - rightVersion.major;
  }

  if (leftVersion.minor !== rightVersion.minor) {
    return leftVersion.minor - rightVersion.minor;
  }

  return leftVersion.patch - rightVersion.patch;
}

function pickLatestSemver(values) {
  const versions = Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .map(parseSemver)
      .filter(Boolean)
      .map((entry) => entry.version)
  ));

  if (!versions.length) {
    return '';
  }

  return versions.sort(compareSemver).at(-1);
}

module.exports = {
  compareSemver,
  parseSemver,
  pickLatestSemver
};
