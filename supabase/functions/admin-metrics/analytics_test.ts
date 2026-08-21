import {
  activation,
  activeUserMix,
  compareCohortStats,
  DAY_MS,
  metricPoint,
  previousRange,
  retention,
  timeToFirstValue,
  uniqueUsers,
} from "./analytics.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const at = (value: string) => new Date(value);
const users = [
  { id: 1, createdAt: at("2026-01-01T00:00:00Z") },
  { id: 2, createdAt: at("2026-01-02T00:00:00Z") },
  { id: 3, createdAt: at("2025-12-01T00:00:00Z") },
];
const valueEvents = [
  { userId: 1, at: at("2026-01-03T00:00:00Z"), kind: "recipe" as const },
  { userId: 2, at: at("2026-01-12T00:00:00Z"), kind: "save" as const },
];
const activityEvents = [
  ...valueEvents,
  { userId: 1, at: at("2026-01-08T12:00:00Z"), kind: "conversation" as const },
  { userId: 3, at: at("2026-01-05T00:00:00Z"), kind: "meal_plan" as const },
];

Deno.test("builds the immediately preceding period", () => {
  const previous = previousRange({
    from: at("2026-01-08T00:00:00Z"),
    toExclusive: at("2026-01-15T00:00:00Z"),
  });
  assertEquals(previous.from.toISOString(), "2026-01-01T00:00:00.000Z");
  assertEquals(previous.toExclusive.toISOString(), "2026-01-08T00:00:00.000Z");
});

Deno.test("calculates percentage change without inventing a zero baseline", () => {
  assertEquals(metricPoint(120, 100), {
    value: 120,
    previous: 100,
    change_percent: 20,
  });
  assertEquals(metricPoint(5, 0).change_percent, null);
  assertEquals(metricPoint(0, 0).change_percent, 0);
});

Deno.test("calculates seven-day activation only for mature users", () => {
  assertEquals(
    activation(users.slice(0, 2), valueEvents, at("2026-01-20T00:00:00Z")),
    {
      value: 50,
      numerator: 1,
      denominator: 2,
    },
  );
});

Deno.test("calculates exact-day retention", () => {
  assertEquals(
    retention([users[0]], activityEvents, 7, at("2026-02-10T00:00:00Z")),
    {
      value: 100,
      numerator: 1,
      denominator: 1,
    },
  );
});

Deno.test("calculates average and median time to first value", () => {
  const result = timeToFirstValue(
    users.slice(0, 2),
    [
      valueEvents[0],
      {
        userId: 2,
        at: new Date(users[1].createdAt.getTime() + 4 * DAY_MS),
        kind: "save",
      },
    ],
    at("2026-01-20T00:00:00Z"),
  );
  assertEquals(result.average_days, 3);
  assertEquals(result.median_days, 3);
  assertEquals(result.sample_size, 2);
});

Deno.test("separates new and returning active users", () => {
  const range = {
    from: at("2026-01-01T00:00:00Z"),
    toExclusive: at("2026-01-10T00:00:00Z"),
  };
  assertEquals(activeUserMix(users, activityEvents, range), {
    new_users: 1,
    returning_users: 1,
  });
  assertEquals(uniqueUsers(activityEvents, range), new Set([1, 3]));
});

Deno.test("keeps cohort sample sizes in comparisons", () => {
  assertEquals(
    compareCohortStats(
      { value: 50, numerator: 5, denominator: 10 },
      { value: 40, numerator: 4, denominator: 10 },
    ),
    {
      value: 50,
      previous: 40,
      change_percent: 25,
      numerator: 5,
      denominator: 10,
      previous_numerator: 4,
      previous_denominator: 10,
    },
  );
});
