"use strict";

const VERSION_PATTERN = /export const APP_VERSION = '([^']+)';/;

const readVersion = (contents) => {
  const match = VERSION_PATTERN.exec(contents);

  if (!match) {
    throw new Error("APP_VERSION constant was not found.");
  }

  return match[1];
};

const writeVersion = (contents, version) => {
  if (!VERSION_PATTERN.test(contents)) {
    throw new Error("APP_VERSION constant was not found.");
  }

  return contents.replace(
    VERSION_PATTERN,
    `export const APP_VERSION = '${version}';`,
  );
};

module.exports = {
  readVersion,
  writeVersion,
};
