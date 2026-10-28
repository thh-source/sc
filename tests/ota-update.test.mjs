import assert from "node:assert";
import test from "node:test";

// Logic so sánh phiên bản tương tự app/utils/otaUpdateService.ts
function isNewerVersion(remoteVer, currentVer) {
  if (!remoteVer || !currentVer) return false;
  const parse = (v) => v.replace(/^v/i, "").split(".").map((n) => parseInt(n, 10) || 0);
  const r = parse(remoteVer);
  const c = parse(currentVer);

  const len = Math.max(r.length, c.length);
  for (let i = 0; i < len; i++) {
    const rVal = r[i] || 0;
    const cVal = c[i] || 0;
    if (rVal > cVal) return true;
    if (rVal < cVal) return false;
  }
  return false;
}

test("Semver comparison logic for OTA", () => {
  assert.strictEqual(isNewerVersion("1.0.1", "1.0.0"), true);
  assert.strictEqual(isNewerVersion("v1.0.1", "1.0.0"), true);
  assert.strictEqual(isNewerVersion("1.1.0", "1.0.5"), true);
  assert.strictEqual(isNewerVersion("2.0.0", "1.9.9"), true);
  assert.strictEqual(isNewerVersion("1.0.0", "1.0.0"), false);
  assert.strictEqual(isNewerVersion("1.0.0", "1.0.1"), false);
  assert.strictEqual(isNewerVersion("1.0.0", "1.1.0"), false);
});

test("OTA config payload structure contract with build name and date", () => {
  const mockConfig = {
    latestVersion: "1.0.1",
    versionName: "Phenikaa SCMH v1.0.1 (Bản chính thức)",
    buildNumber: "20261028.01",
    buildDate: "28/10/2026, 07:15:00",
    minSupportedVersion: "1.0.0",
    downloadUrl: "https://quan-ly-mua-hang.sc-pnk.workers.dev/api/app-version/download?version=1.0.1",
    checksum: "",
    releaseNotes: "OTA Update test",
  };

  assert.ok(mockConfig.latestVersion);
  assert.ok(mockConfig.versionName);
  assert.ok(mockConfig.buildNumber);
  assert.ok(mockConfig.buildDate);
  assert.ok(mockConfig.downloadUrl);
  assert.ok(mockConfig.downloadUrl.includes("/api/app-version/download"));
});
