import { expect, test } from "bun:test";
import { idkitEnvironment } from "./environment";

test("IDKit uses the environment supplied by the API request context", () => {
  expect(idkitEnvironment("production")).toBe("production");
  expect(idkitEnvironment("staging")).toBe("staging");
  for (const value of ["", "invalid", " production "]) {
    expect(() => idkitEnvironment(value)).toThrow("World ID environment");
  }
});
