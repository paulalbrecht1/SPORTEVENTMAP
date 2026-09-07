const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const RELEASE_CHECKS = Object.freeze([
  "check-publish-readiness.js",
  "check-data-quality-release.js",
  "check-catalog-release.js"
]);

// Every release entry point uses the same checks against the current source
// and real clock. There is deliberately no skip, alternate-root or time option.
function assertReleaseReadiness() {
  for (const script of RELEASE_CHECKS) {
    try {
      execFileSync(process.execPath, [path.join(__dirname, script)], {
        cwd: ROOT,
        stdio: "inherit"
      });
    } catch (error) {
      throw new Error(`Release readiness blocked by ${script}.`, { cause: error });
    }
  }
}

if (require.main === module) {
  try {
    assertReleaseReadiness();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { assertReleaseReadiness };
