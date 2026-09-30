import { it, expect } from "vitest";
import { selectPools, shuffle } from "./selection.js";
it("allocates overlapping pools without duplicate or greedy false insufficiency", () => {
  expect(
    selectPools(
      [
        { ids: ["a", "b"], pickCount: 1 },
        { ids: ["a"], pickCount: 1 },
      ],
      [],
      false,
    )
      .flat()
      .sort(),
  ).toEqual(["a", "b"]);
});
it("excludes fixed and rejects globally insufficient pools", () => {
  expect(
    selectPools([{ ids: ["a", "b", "c"], pickCount: 2 }], ["a"])
      .flat()
      .sort(),
  ).toEqual(["b", "c"]);
  expect(() =>
    selectPools(
      [
        { ids: ["a"], pickCount: 1 },
        { ids: ["a"], pickCount: 1 },
      ],
      [],
    ),
  ).toThrow("Pool");
});
it("shuffle preserves input and membership", () => {
  const a = [1, 2, 3, 4, 5];
  expect(shuffle(a).sort()).toEqual(a);
  expect(a).toEqual([1, 2, 3, 4, 5]);
});
