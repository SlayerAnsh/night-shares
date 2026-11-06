import { expect, test } from "bun:test";
import { hash } from "./hash";

test("hash uses unsigned FNV-1a over UTF-16 code units", () => {
  expect(hash("")).toBe(2166136261);
  expect(hash("hello")).toBe(1335831723);
});
