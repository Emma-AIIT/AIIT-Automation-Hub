// Unit tests for the repeat maths behind scheduled broadcasts.
//   npm test   (node --test; Node 22.18+ strips the TypeScript types itself)
// Sydney: AEDT is UTC+11, AEST is UTC+10. DST starts on the first Sunday of
// October (2:00 -> 3:00) and ends on the first Sunday of April (3:00 -> 2:00).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  describeSeries,
  nextFutureOccurrence,
  nextOccurrence,
} from "../src/lib/schedule-repeat.ts";

const iso = (d) => d.toISOString();

describe("nextOccurrence", () => {
  // Mon 9 Nov 2026, 9:00 am AEDT
  const anchor = "2026-11-08T22:00:00.000Z";

  it("index 0 and 'none' return the anchor", () => {
    assert.equal(iso(nextOccurrence(anchor, "weekly", 0)), anchor);
    assert.equal(iso(nextOccurrence(anchor, "none", 3)), anchor);
  });

  it("daily adds calendar days", () => {
    assert.equal(iso(nextOccurrence(anchor, "daily", 1)), "2026-11-09T22:00:00.000Z");
    assert.equal(iso(nextOccurrence(anchor, "daily", 30)), "2026-12-08T22:00:00.000Z");
  });

  it("weekly adds 7 days per index", () => {
    assert.equal(iso(nextOccurrence(anchor, "weekly", 1)), "2026-11-15T22:00:00.000Z");
    assert.equal(iso(nextOccurrence(anchor, "weekly", 3)), "2026-11-29T22:00:00.000Z");
  });

  it("monthly keeps the day of month and rolls the year", () => {
    assert.equal(iso(nextOccurrence(anchor, "monthly", 1)), "2026-12-08T22:00:00.000Z");
    assert.equal(iso(nextOccurrence(anchor, "monthly", 2)), "2027-01-08T22:00:00.000Z");
  });

  it("keeps 9:00 am when daylight saving starts (first Sunday of October)", () => {
    // Sat 3 Oct 2026 9:00 AEST -> Sun 4 Oct 9:00 AEDT
    const sat = "2026-10-02T23:00:00.000Z";
    assert.equal(iso(nextOccurrence(sat, "daily", 1)), "2026-10-03T22:00:00.000Z");
    // Weekly across the change: Mon 28 Sep AEST -> Mon 5 Oct AEDT
    assert.equal(iso(nextOccurrence("2026-09-27T23:00:00.000Z", "weekly", 1)), "2026-10-04T22:00:00.000Z");
  });

  it("keeps 9:00 am when daylight saving ends (first Sunday of April)", () => {
    // Sat 3 Apr 2027 9:00 AEDT -> Sun 4 Apr 9:00 AEST
    const sat = "2027-04-02T22:00:00.000Z";
    assert.equal(iso(nextOccurrence(sat, "daily", 1)), "2027-04-03T23:00:00.000Z");
  });

  it("clamps monthly sends on the 31st to the end of shorter months", () => {
    // 31 Jan 2027 9:00 AEDT
    const jan31 = "2027-01-30T22:00:00.000Z";
    assert.equal(iso(nextOccurrence(jan31, "monthly", 1)), "2027-02-27T22:00:00.000Z"); // 28 Feb
    assert.equal(iso(nextOccurrence(jan31, "monthly", 2)), "2027-03-30T22:00:00.000Z"); // back to 31 Mar
    assert.equal(iso(nextOccurrence(jan31, "monthly", 3)), "2027-04-29T23:00:00.000Z"); // 30 Apr, AEST
  });

  it("handles a leap-year February", () => {
    // 31 Jan 2028 9:00 AEDT -> 29 Feb 2028
    assert.equal(iso(nextOccurrence("2028-01-30T22:00:00.000Z", "monthly", 1)), "2028-02-28T22:00:00.000Z");
  });
});

describe("nextFutureOccurrence", () => {
  const anchor = "2026-11-08T22:00:00.000Z"; // Mon 9 Nov 9:00 am AEDT

  it("returns the next slot when the cron is on time", () => {
    const now = new Date("2026-11-08T22:00:30.000Z");
    const next = nextFutureOccurrence(anchor, "daily", 1, now);
    assert.equal(next.index, 1);
    assert.equal(iso(next.at), "2026-11-09T22:00:00.000Z");
  });

  it("skips slots missed while the cron was down", () => {
    const now = new Date("2026-11-11T12:00:00.000Z"); // Wed 11 Nov 11 pm
    const next = nextFutureOccurrence(anchor, "daily", 1, now);
    assert.equal(next.index, 3);
    assert.equal(iso(next.at), "2026-11-11T22:00:00.000Z"); // Thu 12 Nov 9:00
  });

  it("never returns a slot equal to now", () => {
    const now = new Date("2026-11-15T22:00:00.000Z");
    const next = nextFutureOccurrence(anchor, "weekly", 1, now);
    assert.equal(next.index, 2);
    assert.equal(iso(next.at), "2026-11-22T22:00:00.000Z");
  });

  it("starts no earlier than fromIndex", () => {
    const now = new Date("2026-11-01T00:00:00.000Z");
    assert.equal(nextFutureOccurrence(anchor, "weekly", 2, now).index, 2);
  });

  it("refuses a one-off schedule", () => {
    assert.throws(() => nextFutureOccurrence(anchor, "none", 1));
  });
});

describe("describeSeries", () => {
  it("previews the first and last send in Sydney time", () => {
    assert.equal(
      describeSeries("2026-11-08T22:00:00.000Z", "weekly", 4),
      "Sends 4 times: Mon 9 Nov … last Mon 30 Nov, 9:00 am",
    );
  });
});
