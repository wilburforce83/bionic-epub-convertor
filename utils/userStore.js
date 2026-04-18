const crypto = require('crypto');
const SimpleJsonDB = require('simple-json-db');

const DEFAULT_BOOTSTRAP_USERNAME = 'admin';
const DEFAULT_BOOTSTRAP_PASSWORD = 'dyslibria';
const USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/;
const VALID_ROLES = new Set(['admin', 'reader']);

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

function validateUsername(value) {
  const normalized = normalizeUsername(value);
  if (!USERNAME_PATTERN.test(normalized)) {
    throw new Error('Usernames must be 3-32 characters and use only lowercase letters, numbers, dots, underscores, or hyphens.');
  }

  return normalized;
}

function validateRole(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!VALID_ROLES.has(normalized)) {
    throw new Error('Role must be admin or reader.');
  }

  return normalized;
}

function validatePassword(value) {
  const password = String(value || '');
  if (password.length < 8) {
    throw new Error('Passwords must be at least 8 characters long.');
  }

  if (password.length > 256) {
    throw new Error('Passwords must be shorter than 257 characters.');
  }

  return password;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || typeof storedHash !== 'string') {
    return false;
  }

  const [algorithm, salt, hash] = storedHash.split('$');
  if (algorithm !== 'scrypt' || !salt || !hash) {
    return false;
  }

  const derivedHash = crypto.scryptSync(String(password || ''), salt, 64);
  const storedBuffer = Buffer.from(hash, 'hex');

  if (derivedHash.length !== storedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(derivedHash, storedBuffer);
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    isActive: user.isActive !== false,
    createdAt: user.createdAt || null,
    updatedAt: user.updatedAt || null,
    lastLoginAt: user.lastLoginAt || null
  };
}

function createUserStore(filePath) {
  const db = new SimpleJsonDB(filePath);

  function readState() {
    const raw = db.JSON();
    const users = Array.isArray(raw && raw.users) ? raw.users.slice() : [];

    return {
      version: 1,
      users
    };
  }

  function writeState(state) {
    db.JSON({
      version: 1,
      users: Array.isArray(state.users) ? state.users : []
    });
    db.sync();
  }

  function listUsers() {
    return readState().users.map(publicUser);
  }

  function listRawUsers() {
    return readState().users;
  }

  function hasUsers() {
    return listRawUsers().some((user) => user && user.isActive !== false);
  }

  function getUserById(id) {
    return listRawUsers().find((user) => user && user.id === id) || null;
  }

  function findUserByUsername(username) {
    const normalized = normalizeUsername(username);
    return listRawUsers().find((user) => user && user.username === normalized) || null;
  }

  function countAdmins(users) {
    return users.filter((user) => user && user.isActive !== false && user.role === 'admin').length;
  }

  function ensureLegacyAdmin({ username, password }) {
    const normalizedUsername = normalizeUsername(username);
    const normalizedPassword = String(password || '');

    if (hasUsers() || !normalizedUsername || !normalizedPassword) {
      return null;
    }

    const state = readState();
    const now = new Date().toISOString();
    const user = {
      id: crypto.randomUUID(),
      username: validateUsername(normalizedUsername),
      passwordHash: hashPassword(normalizedPassword),
      role: 'admin',
      isActive: true,
      createdAt: now,
      updatedAt: now,
      lastLoginAt: null
    };

    state.users.push(user);
    writeState(state);
    return publicUser(user);
  }

  function createInitialAdmin({ username, password }) {
    if (hasUsers()) {
      throw new Error('Initial setup has already been completed.');
    }

    const state = readState();
    const now = new Date().toISOString();
    const user = {
      id: crypto.randomUUID(),
      username: validateUsername(username),
      passwordHash: hashPassword(validatePassword(password)),
      role: 'admin',
      isActive: true,
      createdAt: now,
      updatedAt: now,
      lastLoginAt: null
    };

    state.users.push(user);
    writeState(state);
    return publicUser(user);
  }

  function createUser({ username, password, role }) {
    const state = readState();
    const normalizedUsername = validateUsername(username);

    if (state.users.some((user) => user.username === normalizedUsername)) {
      throw new Error('That username already exists.');
    }

    const now = new Date().toISOString();
    const user = {
      id: crypto.randomUUID(),
      username: normalizedUsername,
      passwordHash: hashPassword(validatePassword(password)),
      role: validateRole(role),
      isActive: true,
      createdAt: now,
      updatedAt: now,
      lastLoginAt: null
    };

    state.users.push(user);
    writeState(state);
    return publicUser(user);
  }

  function updateUser(userId, updates) {
    const state = readState();
    const user = state.users.find((entry) => entry && entry.id === userId);

    if (!user) {
      throw new Error('User not found.');
    }

    const nextRole = updates.role !== undefined ? validateRole(updates.role) : user.role;
    const nextActive = updates.isActive !== undefined ? Boolean(updates.isActive) : user.isActive !== false;

    if (user.role === 'admin' && (!nextActive || nextRole !== 'admin') && countAdmins(state.users) <= 1) {
      throw new Error('Dyslibria must keep at least one active administrator.');
    }

    user.role = nextRole;
    user.isActive = nextActive;

    if (updates.password !== undefined && String(updates.password || '').trim()) {
      user.passwordHash = hashPassword(validatePassword(updates.password));
    }

    user.updatedAt = new Date().toISOString();
    writeState(state);
    return publicUser(user);
  }

  function deleteUser(userId) {
    const state = readState();
    const user = state.users.find((entry) => entry && entry.id === userId);

    if (!user) {
      throw new Error('User not found.');
    }

    if (user.role === 'admin' && user.isActive !== false && countAdmins(state.users) <= 1) {
      throw new Error('Dyslibria must keep at least one active administrator.');
    }

    state.users = state.users.filter((entry) => entry.id !== userId);
    writeState(state);
  }

  function authenticate(username, password) {
    const normalizedUsername = normalizeUsername(username);
    const passwordValue = String(password || '');

    if (!hasUsers()) {
      const bootstrapMatch =
        normalizedUsername === DEFAULT_BOOTSTRAP_USERNAME &&
        passwordValue === DEFAULT_BOOTSTRAP_PASSWORD;

      if (!bootstrapMatch) {
        return null;
      }

      return {
        type: 'bootstrap',
        user: {
          id: 'bootstrap-admin',
          username: DEFAULT_BOOTSTRAP_USERNAME,
          role: 'admin',
          isActive: true
        }
      };
    }

    const user = findUserByUsername(normalizedUsername);
    if (!user || user.isActive === false || !verifyPassword(passwordValue, user.passwordHash)) {
      return null;
    }

    return {
      type: 'user',
      user: publicUser(user)
    };
  }

  function recordLogin(userId) {
    const state = readState();
    const user = state.users.find((entry) => entry && entry.id === userId);
    if (!user) {
      return;
    }

    const now = new Date().toISOString();
    user.lastLoginAt = now;
    user.updatedAt = now;
    writeState(state);
  }

  function updateOwnPassword(userId, currentPassword, newPassword) {
    const state = readState();
    const user = state.users.find((entry) => entry && entry.id === userId);

    if (!user) {
      throw new Error('User not found.');
    }

    if (!verifyPassword(currentPassword, user.passwordHash)) {
      throw new Error('Current password is incorrect.');
    }

    user.passwordHash = hashPassword(validatePassword(newPassword));
    user.updatedAt = new Date().toISOString();
    writeState(state);
    return publicUser(user);
  }

  return {
    DEFAULT_BOOTSTRAP_USERNAME,
    DEFAULT_BOOTSTRAP_PASSWORD,
    hasUsers,
    listUsers,
    getUserById: (id) => {
      const user = getUserById(id);
      return user ? publicUser(user) : null;
    },
    authenticate,
    ensureLegacyAdmin,
    createInitialAdmin,
    createUser,
    updateUser,
    deleteUser,
    updateOwnPassword,
    recordLogin
  };
}

module.exports = {
  createUserStore,
  DEFAULT_BOOTSTRAP_USERNAME,
  DEFAULT_BOOTSTRAP_PASSWORD
};
