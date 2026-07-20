const fs = require("fs");
const path = require("path");

const ROOT =
  path.resolve(__dirname, "..");

const DIST =
  path.join(ROOT, "dist");

const COPY_ENTRIES = [
  "index.html",
  "RELEASE_VERSION.txt",
  "sitemap.xml",
  "robots.txt",
  "favicon.ico",
  "favicon-32x32.png",
  "favicon-48x48.png",
  "favicon-96x96.png",
  "favicon-192x192.png",
  "favicon-512x512.png",
  "apple-touch-icon.png",
  "site.webmanifest",
  "assets/logo.png",
  "assets/brand/sport-event-map-icon.svg",
  "about.html",
  "contact.html",
  "legal.html",
  "imprint.html",
  "privacy.html",
  "css/style.css",
  "js/app.js",
  "js/i18n.js",
  "js/supabase-loader.js",
  "js/events.js",
  "js/map.js",
  "js/search.js",
  "js/supabase.js",
  "data/events.csv",
  "data/event-category-details.json",
  "data/event-knowledge.json",
  "data/event-knowledge-audit.json",
  "data/event-knowledge-review.json",
  "data/event-knowledge-research-status.json"
];

const COPY_DIRECTORIES = [
  "event"
];

const BINARY_EXTENSIONS = new Set([
  ".ico",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp"
]);

const SECRET_PATTERNS = [
  {
    pattern: /\b[0-9a-f]{32}\b/i,
    // Public event URLs can contain TYPO3 cHash values that look like keys.
    skipFiles: [path.join("data", "events.csv")]
  },
  {
    pattern: /service_role/i
  },
  {
    pattern: /api_secret\s*[:=]\s*["'][^"']{8,}/i
  },
  {
    pattern: /private_key\s*[:=]\s*["'][^"']{8,}/i
  },
  {
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/
  }
];

function removeDirectory(directory) {
  fs.rmSync(directory, {
    recursive: true,
    force: true
  });
}

function copyFile(relativePath) {
  const source =
    path.join(ROOT, relativePath);

  const target =
    path.join(DIST, relativePath);

  if (!fs.existsSync(source)) {
    throw new Error(
      `Missing publish file: ${relativePath}`
    );
  }

  fs.mkdirSync(
    path.dirname(target),
    {
      recursive: true
    }
  );

  fs.copyFileSync(source, target);
}

function copyDirectory(relativePath) {
  const source =
    path.join(ROOT, relativePath);

  const target =
    path.join(DIST, relativePath);

  if (!fs.existsSync(source)) {
    throw new Error(
      `Missing publish directory: ${relativePath}`
    );
  }

  fs.cpSync(
    source,
    target,
    { recursive: true }
  );
}

function readExistingConfigValue(name) {
  const configPath =
    path.join(ROOT, "js", "config.js");

  const content =
    fs.readFileSync(configPath, "utf8");

  const match =
    new RegExp(
      `${name}\\s*:\\s*["']([^"']*)["']`
    ).exec(content);

  return match ? match[1] : "";
}

function writeRuntimeConfig() {
  const target =
    path.join(DIST, "js", "config.js");

  const config = {
    supabaseUrl:
      process.env.SPORT_EVENT_MAP_SUPABASE_URL ||
      readExistingConfigValue("supabaseUrl"),
    supabaseAnonKey:
      process.env.SPORT_EVENT_MAP_SUPABASE_PUBLIC_KEY ||
      process.env.SPORT_EVENT_MAP_SUPABASE_ANON_KEY ||
      readExistingConfigValue("supabaseAnonKey"),
    siteUrl:
      process.env.SPORT_EVENT_MAP_SITE_URL ||
      readExistingConfigValue("siteUrl"),
    authCallbackPath:
      process.env.SPORT_EVENT_MAP_AUTH_CALLBACK_PATH ||
      readExistingConfigValue("authCallbackPath") ||
      "index.html",
    passwordResetPath:
      process.env.SPORT_EVENT_MAP_PASSWORD_RESET_PATH ||
      readExistingConfigValue("passwordResetPath") ||
      "index.html",
    feedbackEmail:
      process.env.SPORT_EVENT_MAP_FEEDBACK_EMAIL ||
      readExistingConfigValue("feedbackEmail") ||
      "feedback@[your-domain].com"
  };

  if (
    !config.supabaseUrl ||
    !config.supabaseAnonKey
  ) {
    throw new Error(
      "Public Supabase runtime configuration is missing."
    );
  }

  if (
    config.siteUrl &&
    !/^https:\/\//i.test(config.siteUrl)
  ) {
    throw new Error(
      "SPORT_EVENT_MAP_SITE_URL must use HTTPS for production."
    );
  }

  fs.mkdirSync(
    path.dirname(target),
    { recursive: true }
  );

  fs.writeFileSync(
    target,
    `window.SPORT_EVENT_MAP_CONFIG = ${JSON.stringify(config, null, 2)};\n\ndocument.documentElement.dataset.appConfig = "loaded";\n`,
    "utf8"
  );
}

function walk(directory, files = []) {
  if (!fs.existsSync(directory)) {
    return files;
  }

  fs.readdirSync(directory)
    .forEach(child => {
      const childPath =
        path.join(directory, child);

      const stat =
        fs.statSync(childPath);

      if (stat.isDirectory()) {
        walk(childPath, files);
        return;
      }

      files.push(childPath);
    });

  return files;
}

function validateDist() {
  const files =
    walk(DIST);

  const failures = [];

  files.forEach(filePath => {
    const relativePath =
      path.relative(DIST, filePath);

    if (
      BINARY_EXTENSIONS.has(
        path.extname(filePath).toLowerCase()
      )
    ) {
      return;
    }

    const content =
      fs.readFileSync(filePath, "utf8");

    SECRET_PATTERNS.forEach(rule => {
      if (
        rule.skipFiles &&
        rule.skipFiles.includes(relativePath)
      ) {
        return;
      }

      if (rule.pattern.test(content)) {
        failures.push(relativePath);
      }
    });
  });

  if (failures.length) {
    throw new Error(
      `Potential private secret found in dist: ${failures.join(", ")}`
    );
  }

  const disallowed = [
    "tools",
    "supabase",
    path.join("data", "imports"),
    "SECURITY.md",
    "LOCAL_PUBLISH.md",
    "DEPLOYMENT.md",
    "netlify.toml"
  ];

  disallowed.forEach(entry => {
    const target =
      path.join(DIST, entry);

    if (fs.existsSync(target)) {
      throw new Error(
        `Publish package contains non-public folder/file: ${entry}`
      );
    }
  });
}

function main() {
  require("./generate-event-pages.js");
  require("./generate-sitemap.js");

  removeDirectory(DIST);

  COPY_ENTRIES.forEach(copyFile);
  COPY_DIRECTORIES.forEach(copyDirectory);
  writeRuntimeConfig();

  validateDist();

  console.log(
    "Publish package ready: dist"
  );

  console.log(
    `Copied files: ${COPY_ENTRIES.length + 1}; directories: ${COPY_DIRECTORIES.length}`
  );
}

main();
