import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const globalStyles = readFileSync(new URL("../src/styles/global.scss", import.meta.url), "utf8");

test("labelled textareas hide example text until focused", () => {
  assert.match(
    globalStyles,
    /\.v-textarea \.v-field:not\(\.v-field--no-label, \.v-field--focused\) textarea::placeholder\s*\{[\s\S]*?opacity:\s*0/,
  );
});
