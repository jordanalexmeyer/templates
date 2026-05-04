import { spawnSync } from "node:child_process";
import process from "node:process";

import { fetchPlaygroundTypescriptDirNames } from "./fetch-playground-typescript-dirs.mjs";

async function main() {
  const dirs = await fetchPlaygroundTypescriptDirNames();
  dirs.sort();

  const argv = ["scripts/build-javascript.mjs"];
  for (const name of dirs) {
    argv.push("--include-template", name);
  }

  process.stdout.write(`Building ${dirs.length} playground TypeScript templates…\n`);
  const build = spawnSync(process.execPath, argv, { stdio: "inherit", encoding: "utf8" });
  if (build.status !== 0) {
    process.exit(build.status ?? 1);
  }

  const validate = spawnSync(process.execPath, ["scripts/validate-playground-templates.mjs"], {
    stdio: "inherit",
    encoding: "utf8",
  });
  if (validate.status !== 0) {
    process.exit(validate.status ?? 1);
  }

  process.stdout.write("Playground CI: build + validation passed.\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
