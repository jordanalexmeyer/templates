import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import console from "node:console";
import path from "node:path";
import process from "node:process";
import ts from "typescript";

const ROOT_DIR = process.cwd();
const TYPESCRIPT_DIR = path.join(ROOT_DIR, "typescript");
const JAVASCRIPT_DIR = path.join(ROOT_DIR, "javascript");

const DEFAULT_EXCLUDED_DIRS = new Set(["node_modules", ".next", "dist", "build", "coverage"]);

function normalizeRelativePath(filePath) {
  return filePath.split(path.sep).join("/");
}

function parseListFlag(argv, flagName) {
  const values = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg !== flagName && !arg.startsWith(`${flagName}=`)) continue;

    const inlineValue = arg.startsWith(`${flagName}=`) ? arg.slice(flagName.length + 1) : null;
    const nextValue = argv[index + 1];
    const value = inlineValue ?? nextValue;
    if (!value || value.startsWith("--")) {
      throw new Error(
        `Missing value for ${flagName} (use "${flagName} value" or "${flagName}=value")`,
      );
    }

    values.push(
      ...value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    );
    if (inlineValue === null) {
      index += 1;
    }
  }

  return values;
}

function createFileFilter(argv) {
  const includeTemplates = new Set(parseListFlag(argv, "--include-template"));
  const genericExcludes = parseListFlag(argv, "--exclude");
  const excludeTemplates = new Set([...parseListFlag(argv, "--exclude-template"), ...genericExcludes]);
  const includePaths = parseListFlag(argv, "--include-path");
  const excludePaths = [...parseListFlag(argv, "--exclude-path"), ...genericExcludes];

  return (sourcePath) => {
    const relativePath = path.relative(TYPESCRIPT_DIR, sourcePath);
    const normalizedPath = normalizeRelativePath(relativePath);
    const [templateName] = normalizedPath.split("/");

    if (!templateName) return false;
    if (normalizedPath.endsWith(".d.ts")) return false;

    const pathSegments = normalizedPath.split("/");
    if (pathSegments.some((segment) => DEFAULT_EXCLUDED_DIRS.has(segment))) return false;

    if (includeTemplates.size > 0 && !includeTemplates.has(templateName)) return false;
    if (excludeTemplates.has(templateName)) return false;

    if (includePaths.length > 0 && !includePaths.some((token) => normalizedPath.includes(token))) {
      return false;
    }

    if (excludePaths.some((token) => normalizedPath.includes(token))) return false;

    return true;
  };
}

async function getTypeScriptFiles(dir, fileFilter) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return getTypeScriptFiles(fullPath, fileFilter);
      }

      if (
        entry.isFile() &&
        (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) &&
        fileFilter(fullPath)
      ) {
        return [fullPath];
      }

      return [];
    }),
  );

  return files.flat();
}

async function transpileFile(sourcePath) {
  const relativePath = path.relative(TYPESCRIPT_DIR, sourcePath);
  const outputPath = path
    .join(JAVASCRIPT_DIR, relativePath)
    .replace(/\.tsx?$/, (ext) => (ext === ".tsx" ? ".jsx" : ".js"));

  const source = await readFile(sourcePath, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      jsx: ts.JsxEmit.Preserve,
    },
    reportDiagnostics: true,
    fileName: sourcePath,
  });

  if (transpiled.diagnostics?.length) {
    const message = ts.formatDiagnosticsWithColorAndContext(transpiled.diagnostics, {
      getCurrentDirectory: () => ROOT_DIR,
      getCanonicalFileName: (fileName) => fileName,
      getNewLine: () => "\n",
    });

    throw new Error(`TypeScript transpile diagnostics in ${relativePath}\n${message}`);
  }

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, transpiled.outputText, "utf8");
}

async function buildJavaScriptTemplates() {
  const fileFilter = createFileFilter(process.argv.slice(2));

  await rm(JAVASCRIPT_DIR, { recursive: true, force: true });
  await mkdir(JAVASCRIPT_DIR, { recursive: true });

  const tsFiles = await getTypeScriptFiles(TYPESCRIPT_DIR, fileFilter);
  await Promise.all(tsFiles.map((file) => transpileFile(file)));

  const args = process.argv.slice(2);
  if (args.length > 0) {
    console.log(`Filters: ${args.join(" ")}`);
  }
  console.log(`Built ${tsFiles.length} files into javascript/`);
}

buildJavaScriptTemplates().catch((error) => {
  console.error(error);
  process.exit(1);
});
