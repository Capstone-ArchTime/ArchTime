import test from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import { moduleSpecifiers } from "../src/infrastructure/services/DependencyExtractor.ts";

const read = (code, name = "a.js") => moduleSpecifiers(ts.createSourceFile(name, code, ts.ScriptTarget.Latest, true));

test("JavaScript and TypeScript dependencies: ES modules, CommonJS and dynamic import", () => {
  assert.deepEqual(read([
    "import a from './a';",
    "import type { B } from './b';",
    "import './side-effect';",
    "export * from './c';",
    "export { d } from './d';",
    "import e = require('./e');",
    "const f = require('./f');",
    "function later() { return require(`./g`); }",
    "const h = await import('./h');",
  ].join("\n"), "a.ts"), ["./a", "./b", "./side-effect", "./c", "./d", "./e", "./f", "./g", "./h"]);
});

test("a computed path or another function named like require is not a dependency", () => {
  assert.deepEqual(read("const name = './x'; require(name); obj.require('./y'); myrequire('./z'); export const k = 1; export { k as l };"), []);
});

test("a CommonJS file nested in functions and objects is read whole", () => {
  assert.deepEqual(read("module.exports = { app: () => require('./application'), ctx: require('./context') };"), ["./application", "./context"]);
});
