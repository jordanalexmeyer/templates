import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const REPO_ROOT = process.cwd();
const README_PATH = path.join(REPO_ROOT, "README.md");
const TEMPLATE_ROOTS = {
  typescript: "TS",
  python: "PY",
  go: "GO",
};
const LANGUAGE_ORDER = {
  TS: 0,
  PY: 1,
  GO: 2,
};
const SECTION_PATTERN = /^## All Templates\r?\n\r?\n([\s\S]*?)(?=^##\s)/m;
const ROW_PATTERN = /^\|\s*\[([^\]]+)\]\(([^)]+)\)\s*\|\s*(TS|PY|GO)\s*\|\s*(.+?)\s*\|$/;

function fail(message) {
  console.error(message);
  process.exit(1);
}

function getExpectedEntries() {
  return Object.entries(TEMPLATE_ROOTS)
    .flatMap(([root, language]) => {
      const rootPath = path.join(REPO_ROOT, root);
      return readdirSync(rootPath, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => ({
          name: entry.name,
          path: `${root}/${entry.name}`,
          language,
        }));
    })
    .sort(
      (left, right) =>
        left.name.localeCompare(right.name) ||
        LANGUAGE_ORDER[left.language] - LANGUAGE_ORDER[right.language] ||
        left.path.localeCompare(right.path),
    );
}

function getReadmeSection(readmeContents) {
  const match = readmeContents.match(SECTION_PATTERN);
  if (!match) {
    fail("Could not find the `## All Templates` section in README.md.");
  }

  return match[1];
}

function parseReadmeEntries(section) {
  const lines = section
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|"));

  if (lines.length < 3) {
    fail("README template table is missing rows.");
  }

  const dataLines = lines.slice(2);

  return dataLines.map((line) => {
    const match = line.match(ROW_PATTERN);
    if (!match) {
      fail(`Invalid template row format in README.md:\n${line}`);
    }

    const [, name, templatePath, language, description] = match;
    return {
      name,
      path: templatePath,
      language,
      description: description.trim(),
    };
  });
}

function findDuplicatePaths(entries) {
  const counts = new Map();

  for (const entry of entries) {
    counts.set(entry.path, (counts.get(entry.path) ?? 0) + 1);
  }

  return [...counts.entries()].filter(([, count]) => count > 1).map(([entryPath]) => entryPath);
}

function validateReadmeEntries(entries) {
  const problems = [];

  for (const entry of entries) {
    const segments = entry.path.split("/");
    if (segments.length !== 2) {
      problems.push(
        `README entry \`${entry.path}\` must point to a first-level template directory.`,
      );
      continue;
    }

    const [root] = segments;
    const expectedLanguage = TEMPLATE_ROOTS[root];
    if (!expectedLanguage) {
      problems.push(
        `README entry \`${entry.path}\` must live under one of: ${Object.keys(TEMPLATE_ROOTS).join(", ")}.`,
      );
      continue;
    }

    if (entry.language !== expectedLanguage) {
      problems.push(
        `README entry \`${entry.path}\` is labeled ${entry.language}, but ${root}/ templates must use ${expectedLanguage}.`,
      );
    }

    const directoryName = path.posix.basename(entry.path);
    if (entry.name !== directoryName) {
      problems.push(
        `README entry text \`${entry.name}\` must match directory name \`${directoryName}\`.`,
      );
    }

    const fullPath = path.join(REPO_ROOT, entry.path);
    if (!existsSync(fullPath) || !statSync(fullPath).isDirectory()) {
      problems.push(`README entry \`${entry.path}\` does not exist on disk.`);
    }

    if (!entry.description) {
      problems.push(`README entry \`${entry.path}\` is missing a description.`);
    }
  }

  return problems;
}

function getOrderMessage(expectedEntries, readmeEntries) {
  const expectedPaths = expectedEntries.map((entry) => entry.path);
  const actualPaths = readmeEntries.map((entry) => entry.path);
  const mismatchIndex = expectedPaths.findIndex(
    (expectedPath, index) => expectedPath !== actualPaths[index],
  );

  if (mismatchIndex === -1) {
    return null;
  }

  return [
    "README template rows are out of order.",
    "Sort rows by template name, then by language in TS/PY/GO order.",
    `First mismatch at row ${mismatchIndex + 1}: expected \`${expectedPaths[mismatchIndex]}\`, found \`${actualPaths[mismatchIndex]}\`.`,
  ].join("\n");
}

function main() {
  const readmeContents = readFileSync(README_PATH, "utf8");
  const expectedEntries = getExpectedEntries();
  const readmeEntries = parseReadmeEntries(getReadmeSection(readmeContents));

  const duplicatePaths = findDuplicatePaths(readmeEntries);
  const validationProblems = validateReadmeEntries(readmeEntries);
  const expectedPaths = new Set(expectedEntries.map((entry) => entry.path));
  const readmePaths = new Set(readmeEntries.map((entry) => entry.path));
  const missingEntries = expectedEntries.filter((entry) => !readmePaths.has(entry.path));
  const unexpectedEntries = readmeEntries.filter((entry) => !expectedPaths.has(entry.path));
  const orderProblem = getOrderMessage(expectedEntries, readmeEntries);

  const problems = [];

  if (duplicatePaths.length > 0) {
    problems.push(
      `Duplicate README entries found:\n${duplicatePaths.map((entryPath) => `- ${entryPath}`).join("\n")}`,
    );
  }

  if (validationProblems.length > 0) {
    problems.push(validationProblems.map((problem) => `- ${problem}`).join("\n"));
  }

  if (missingEntries.length > 0) {
    problems.push(
      `Template directories missing from README:\n${missingEntries
        .map((entry) => `- ${entry.path}`)
        .join("\n")}`,
    );
  }

  if (unexpectedEntries.length > 0) {
    problems.push(
      `README entries that do not match any template directory:\n${unexpectedEntries
        .map((entry) => `- ${entry.path}`)
        .join("\n")}`,
    );
  }

  if (orderProblem) {
    problems.push(orderProblem);
  }

  if (problems.length > 0) {
    fail(
      ["README template index is out of sync with the template directory tree.", ...problems].join(
        "\n\n",
      ),
    );
  }

  console.log(
    `README template index matches ${expectedEntries.length} first-level template directories.`,
  );
}

main();
