import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRatio, quantile, ranks, sampler, spearman, wilson } from "../src/lib/stats.ts";

const close = (a: number, b: number, tol = 1e-4) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test("Wilson interval: known values and the edges stay inside 0 and 1", () => {
  const mid = wilson(5, 10);
  close(mid.lo, 0.2366);
  close(mid.hi, 0.7634);
  const none = wilson(0, 10);
  close(none.lo, 0);
  close(none.hi, 0.2775, 1e-3);
  const all = wilson(10, 10);
  close(all.hi, 1);
  close(all.lo, 0.7225, 1e-3);
  assert.ok(Number.isNaN(wilson(0, 0).p));
});

test("Wilson interval narrows as n grows and contains the proportion", () => {
  const a = wilson(30, 100);
  const b = wilson(300, 1000);
  assert.ok(b.hi - b.lo < a.hi - a.lo);
  assert.ok(a.lo < 0.3 && a.hi > 0.3);
});

test("parseRatio reads k/n", () => {
  assert.deepEqual(parseRatio("28/41"), { k: 28, n: 41 });
});

test("ranks give ties the average rank", () => {
  assert.deepEqual(ranks([10, 20, 20, 30]), [1, 2.5, 2.5, 4]);
});

test("Spearman: monotone, reversed, ties and a constant series", () => {
  close(spearman([1, 2, 3, 4, 5], [10, 20, 30, 40, 50]) as number, 1);
  close(spearman([1, 2, 3, 4, 5], [5, 4, 3, 2, 1]) as number, -1);
  close(spearman([1, 2, 3, 4, 5], [5, 6, 7, 8, 7]) as number, 8 / Math.sqrt(95));
  assert.equal(spearman([1, 2, 3], [4, 4, 4]), null);
  assert.equal(spearman([1, 2], [1, 2]), null);
});

test("quantile interpolates between order statistics", () => {
  const s = [1, 2, 3, 4, 5];
  close(quantile(s, 0), 1);
  close(quantile(s, 0.5), 3);
  close(quantile(s, 0.25), 2);
  close(quantile(s, 0.1), 1.4);
  close(quantile(s, 1), 5);
});

test("sampler is reproducible and its draws have the right centre and spread", () => {
  const a = sampler(7);
  const b = sampler(7);
  assert.equal(a.normal(), b.normal());
  const s = sampler(1);
  const xs = Array.from({ length: 20000 }, () => s.normal());
  const mean = xs.reduce((p, v) => p + v, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((p, v) => p + (v - mean) ** 2, 0) / xs.length);
  close(mean, 0, 0.03);
  close(sd, 1, 0.03);
  const t = Array.from({ length: 20000 }, () => s.triangular(0, 1, 4));
  close(t.reduce((p, v) => p + v, 0) / t.length, (0 + 1 + 4) / 3, 0.05);
  assert.ok(t.every((v) => v >= 0 && v <= 4));
});
