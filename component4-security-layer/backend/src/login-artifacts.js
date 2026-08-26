"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const BUILD_DIR = path.join(ROOT, "build");

const LOGIN_WASM_PATH = path.join(BUILD_DIR, "loginVerifier_js", "loginVerifier.wasm");
const LOGIN_ZKEY_PATH = path.join(BUILD_DIR, "loginVerifier_final.zkey");
const LOGIN_VK_PATH = path.join(BUILD_DIR, "loginVerifier_verification_key.json");

function getLoginArtifactPaths() {
  return {
    wasmPath: LOGIN_WASM_PATH,
    zkeyPath: LOGIN_ZKEY_PATH,
    vkPath: LOGIN_VK_PATH,
  };
}

function loginArtifactsAvailable() {
  return (
    fs.existsSync(LOGIN_WASM_PATH) &&
    fs.existsSync(LOGIN_ZKEY_PATH) &&
    fs.existsSync(LOGIN_VK_PATH)
  );
}

module.exports = {
  getLoginArtifactPaths,
  loginArtifactsAvailable,
};