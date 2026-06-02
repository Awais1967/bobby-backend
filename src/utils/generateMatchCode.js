const crypto = require("node:crypto");

const MATCH_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ENTRY_ALPHABET = "0123456789";

function randomCode(length, alphabet) {
  let code = "";

  for (let index = 0; index < length; index += 1) {
    code += alphabet[crypto.randomInt(0, alphabet.length)];
  }

  return code;
}

function generateMatchCode(length = 6) {
  return randomCode(length, MATCH_ALPHABET);
}

function generateEntryCode(length = 4) {
  return randomCode(length, ENTRY_ALPHABET);
}

module.exports = {
  generateEntryCode,
  generateMatchCode,
};
