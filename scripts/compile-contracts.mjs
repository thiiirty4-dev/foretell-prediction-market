import fs from "node:fs";
import path from "node:path";
import solc from "solc";

const root = process.cwd();
const sourceDirectory = path.join(root, "contracts", "src");
const sources = Object.fromEntries(fs.readdirSync(sourceDirectory).filter((name) => name.endsWith(".sol")).map((name) => [`contracts/src/${name}`, { content: fs.readFileSync(path.join(sourceDirectory, name), "utf8") }]));
function findImports(importPath) {
  const candidates = [path.join(root, "node_modules", importPath), path.join(root, importPath), path.join(sourceDirectory, importPath.replace(/^\.\//, ""))];
  const resolved = candidates.find((candidate) => fs.existsSync(candidate));
  return resolved ? { contents: fs.readFileSync(resolved, "utf8") } : { error: `Import not found: ${importPath}` };
}
const input = { language: "Solidity", sources, settings: { optimizer: { enabled: true, runs: 10_000 }, outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } } } };
const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));
const errors = (output.errors ?? []).filter((entry) => entry.severity === "error");
for (const diagnostic of output.errors ?? []) console.error(diagnostic.formattedMessage);
if (errors.length) process.exit(1);
console.log(`compiled ${Object.values(output.contracts ?? {}).reduce((count, file) => count + Object.keys(file).length, 0)} contracts with solc ${solc.version()}`);
