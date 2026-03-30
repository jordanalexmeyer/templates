import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

const ROOT_DIR = process.cwd();
const TYPESCRIPT_DIR = path.join(ROOT_DIR, "typescript");
const JAVASCRIPT_DIR = path.join(ROOT_DIR, "javascript");

async function getTypeScriptFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return getTypeScriptFiles(fullPath);
      }

      if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
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
  await rm(JAVASCRIPT_DIR, { recursive: true, force: true });
  await mkdir(JAVASCRIPT_DIR, { recursive: true });

  const tsFiles = await getTypeScriptFiles(TYPESCRIPT_DIR);
  await Promise.all(tsFiles.map((file) => transpileFile(file)));

  console.log(`Built ${tsFiles.length} files into javascript/`);
}

buildJavaScriptTemplates().catch((error) => {
  console.error(error);
  process.exit(1);
});
