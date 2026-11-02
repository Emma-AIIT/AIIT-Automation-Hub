// Unit tests for the repeat maths behind scheduled broadcasts.
//   npm test   (node --test; Node 22.18+ strips the TypeScript types itself)
// Sydney: AEDT is UTC+11, AEST is UTC+10. DST starts on the first Sunday of
// October (2:00 -> 3:00) and ends on the first Sunday of April (3:00 -> 2:00).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  describePending,
  describeRepeatStatus,
  describeSeries,
  firstSlotOnDate,
  hasMoreToCome,
  minRepeatTotal,
  nextFutureOccurrence,
  nextOccurrence,
  normaliseTimes,
  occurrenceIndex,
  rearmOnEnable,
  totalPosts,
  validateTimes,
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

describe("occurrenceIndex (edited series)", () => {
  it("counts from the anchor when the series was never edited", () => {
    assert.equal(occurrenceIndex(3, 0), 3);
    assert.equal(occurrenceIndex(3, null), 3);
  });

  it("subtracts the sends made before the last edit", () => {
    // 2 of 5 sent, then edited: the new anchor is index 0 for the third send
    assert.equal(occurrenceIndex(2, 2), 0);
    assert.equal(occurrenceIndex(3, 2), 1);
  });

  it("never goes negative", () => {
    assert.equal(occurrenceIndex(0, 2), 0);
  });

  it("drives the cron's next slot from the new anchor", () => {
    // Edited after 2 sends to start Tue 10 Nov 9:00 AEDT, daily. The cron has
    // just made send 3 (index 0), so the next is index 1 = Wed 11 Nov.
    const anchor = "2026-11-09T22:00:00.000Z";
    const now = new Date("2026-11-09T22:00:30.000Z");
    const next = nextFutureOccurrence(anchor, "daily", occurrenceIndex(3, 2), now);
    assert.equal(iso(next.at), "2026-11-10T22:00:00.000Z");
  });
});

describe("minRepeatTotal", () => {
  it("is at least 2, and one more than the sends already made", () => {
    assert.equal(minRepeatTotal(0), 2);
    assert.equal(minRepeatTotal(1), 2);
    assert.equal(minRepeatTotal(2), 3);
  });
});

describe("rearmOnEnable", () => {
  const base = {
    repeat_interval: "daily",
    repeat_anchor_at: "2026-11-08T22:00:00.000Z", // Mon 9 Nov 9:00 AEDT
    repeat_sent: 1,
    repeat_base_sent: 0,
  };

  it("leaves a future time alone", () => {
    const now = new Date("2026-11-09T00:00:00.000Z");
    assert.deepEqual(rearmOnEnable({ ...base, scheduled_at: "2026-11-09T22:00:00.000Z" }, now), {
      scheduledAt: "2026-11-09T22:00:00.000Z",
    });
  });

  it("moves a repeat to its next future slot, skipping missed ones", () => {
    const now = new Date("2026-11-11T12:00:00.000Z"); // Wed 11 Nov 11 pm
    assert.deepEqual(rearmOnEnable({ ...base, scheduled_at: "2026-11-09T22:00:00.000Z" }, now), {
      scheduledAt: "2026-11-11T22:00:00.000Z",
    });
  });

  it("asks for a new time on a one-off that has passed", () => {
    const now = new Date("2026-11-11T12:00:00.000Z");
    assert.equal(
      rearmOnEnable(
        { ...base, repeat_interval: "none", repeat_sent: 0, scheduled_at: "2026-11-09T22:00:00.000Z" },
        now,
      ),
      "needs-new-time",
    );
  });
});

describe("describePending", () => {
  it("labels a one-off and a series", () => {
    const at = "2026-11-02T22:40:00.000Z"; // Tue 3 Nov 9:40 am AEDT
    assert.equal(describePending({ scheduledAt: at, repeatInterval: "none", repeatTotal: 1 }), "Tue 3 Nov 9:40 am");
    assert.equal(
      describePending({ scheduledAt: at, repeatInterval: "daily", repeatTotal: 2 }),
      "Tue 3 Nov 9:40 am, daily ×2",
    );
  });
});

describe("describeSeries", () => {
  it("previews the first and last send in Sydney time", () => {
    assert.equal(
      describeSeries("2026-11-08T22:00:00.000Z", "weekly", 4),
      "Sends 4 times: Mon 9 Nov … last Mon 30 Nov, 9:00 am",
    );
  });

  it("counts posts across several times a day", () => {
    // Tue 3 Nov 9:00 AEDT, daily x4 at 9 am and 6 pm = 8 posts, 3-6 Nov
    assert.equal(
      describeSeries("2026-11-02T22:00:00.000Z", "daily", 4, { times: ["09:00", "18:00"] }),
      "8 posts: Tue 3 Nov … last Fri 6 Nov at 9:00 am & 6:00 pm",
    );
  });

  it("describes a forever series", () => {
    assert.equal(
      describeSeries("2026-11-02T22:00:00.000Z", "daily", 4, { forever: true, times: ["09:00", "18:00"] }),
      "Sends every day at 9:00 am & 6:00 pm until you switch it off",
    );
    assert.equal(
      describeSeries("2026-11-02T22:00:00.000Z", "weekly", 1, { forever: true }),
      "Sends every week at 9:00 am until you switch it off",
    );
  });
});

describe("several times per period (repeat_times)", () => {
  const times = ["09:00", "18:00"];

  it("walks the slots of each day in order", () => {
    const anchor = "2026-11-02T22:00:00.000Z"; // Tue 3 Nov 9:00 AEDT
    assert.equal(iso(nextOccurrence(anchor, "daily", 1, times)), "2026-11-03T07:00:00.000Z"); // 3 Nov 18:00
    assert.equal(iso(nextOccurrence(anchor, "daily", 2, times)), "2026-11-03T22:00:00.000Z"); // 4 Nov 9:00
    assert.equal(iso(nextOccurrence(anchor, "daily", 3, times)), "2026-11-04T07:00:00.000Z"); // 4 Nov 18:00
  });

  it("keeps both wall-clock times when daylight saving starts", () => {
    // Sat 3 Oct 2026 9:00 AEST (UTC+10); Sun 4 Oct is AEDT (UTC+11)
    const anchor = "2026-10-02T23:00:00.000Z";
    assert.equal(iso(nextOccurrence(anchor, "daily", 1, times)), "2026-10-03T08:00:00.000Z"); // Sat 18:00 AEST
    assert.equal(iso(nextOccurrence(anchor, "daily", 2, times)), "2026-10-03T22:00:00.000Z"); // Sun 9:00 AEDT
    assert.equal(iso(nextOccurrence(anchor, "daily", 3, times)), "2026-10-04T07:00:00.000Z"); // Sun 18:00 AEDT
  });

  it("keeps both wall-clock times when daylight saving ends", () => {
    // Sat 3 Apr 2027 9:00 AEDT; Sun 4 Apr is AEST
    const anchor = "2027-04-02T22:00:00.000Z";
    assert.equal(iso(nextOccurrence(anchor, "daily", 1, times)), "2027-04-03T07:00:00.000Z"); // Sat 18:00 AEDT
    assert.equal(iso(nextOccurrence(anchor, "daily", 2, times)), "2027-04-03T23:00:00.000Z"); // Sun 9:00 AEST
    assert.equal(iso(nextOccurrence(anchor, "daily", 3, times)), "2027-04-04T08:00:00.000Z"); // Sun 18:00 AEST
  });

  it("clamps a monthly schedule with two times on the 31st", () => {
    const jan31 = "2027-01-30T22:00:00.000Z"; // 31 Jan 2027 9:00 AEDT
    assert.equal(iso(nextOccurrence(jan31, "monthly", 1, times)), "2027-01-31T07:00:00.000Z"); // 31 Jan 18:00
    assert.equal(iso(nextOccurrence(jan31, "monthly", 2, times)), "2027-02-27T22:00:00.000Z"); // 28 Feb 9:00
    assert.equal(iso(nextOccurrence(jan31, "monthly", 3, times)), "2027-02-28T07:00:00.000Z"); // 28 Feb 18:00
    assert.equal(iso(nextOccurrence(jan31, "monthly", 4, times)), "2027-03-30T22:00:00.000Z"); // 31 Mar 9:00
  });

  it("skips missed slots part-way through a day", () => {
    const anchor = "2026-11-02T22:00:00.000Z"; // Tue 3 Nov 9:00
    // Cron down from 3 Nov 9:00 until Wed 4 Nov noon: 3 Nov 18:00 and 4 Nov 9:00 are skipped
    const now = new Date("2026-11-04T01:00:00.000Z");
    const next = nextFutureOccurrence(anchor, "daily", 1, now, times);
    assert.equal(next.index, 3);
    assert.equal(iso(next.at), "2026-11-04T07:00:00.000Z"); // 4 Nov 18:00
  });

  it("re-anchors on an edit part-way through the day", () => {
    // Edited at 1 pm on Tue 3 Nov: the first slot left that day is 6 pm
    const now = new Date("2026-11-03T02:00:00.000Z");
    const first = firstSlotOnDate("2026-11-03", times, now);
    assert.equal(iso(first), "2026-11-03T07:00:00.000Z");
    // Anchored on the 6 pm slot, the next send is tomorrow 9 am, then 6 pm
    assert.equal(iso(nextOccurrence(first, "daily", 1, times)), "2026-11-03T22:00:00.000Z");
    assert.equal(iso(nextOccurrence(first, "daily", 2, times)), "2026-11-04T07:00:00.000Z");
    // After the edit (2 sent before it), the cron's next slot counts from the new anchor
    const afterSend = new Date("2026-11-03T07:00:30.000Z");
    const next = nextFutureOccurrence(first, "daily", occurrenceIndex(3, 2), afterSend, times);
    assert.equal(iso(next.at), "2026-11-03T22:00:00.000Z");
    // Every time on the date has passed
    assert.equal(firstSlotOnDate("2026-11-03", times, new Date("2026-11-03T08:00:00.000Z")), null);
  });

  it("re-arms a switched-on series to the next future slot", () => {
    const row = {
      scheduled_at: "2026-11-02T22:00:00.000Z",
      repeat_interval: "daily",
      repeat_anchor_at: "2026-11-02T22:00:00.000Z",
      repeat_sent: 0,
      repeat_base_sent: 0,
      repeat_times: times,
    };
    assert.deepEqual(rearmOnEnable(row, new Date("2026-11-03T02:00:00.000Z")), {
      scheduledAt: "2026-11-03T07:00:00.000Z",
    });
  });

  it("normalises and validates the list", () => {
    assert.deepEqual(normaliseTimes(["18:00", "09:00", "18:00", "bad"]), ["09:00", "18:00"]);
    assert.equal(validateTimes(["09:00", "18:00"]), null);
    assert.ok(validateTimes([]));
    assert.ok(validateTimes(["18:00", "09:00"]));
    assert.ok(validateTimes(["09:00", "09:00"]));
    assert.ok(validateTimes(["09:00", "10:00", "11:00", "12:00", "13:00"]));
    assert.ok(validateTimes(["24:00"]));
  });
});

describe("forever and post counts", () => {
  const base = { repeat_interval: "daily", repeat_total: 4, repeat_times: ["09:00", "18:00"] };

  it("a finite series makes repeat_total x times posts", () => {
    assert.equal(totalPosts(4, ["09:00", "18:00"]), 8);
    assert.equal(totalPosts(4, null), 4);
    assert.equal(hasMoreToCome(base, 7), true);
    assert.equal(hasMoreToCome(base, 8), false);
  });

  it("a forever series never finishes", () => {
    const forever = { ...base, repeat_total: 1, repeat_forever: true };
    for (const sent of [1, 2, 100, 10_000]) assert.equal(hasMoreToCome(forever, sent), true);
    // ...and always has a next slot
    const anchor = "2026-11-02T22:00:00.000Z";
    const now = new Date("2031-06-01T00:00:00.000Z");
    const next = nextFutureOccurrence(anchor, "daily", 1, now, forever.repeat_times);
    assert.ok(next.at.getTime() > now.getTime());
  });

  it("a one-off never has more to come, forever or not", () => {
    assert.equal(hasMoreToCome({ repeat_interval: "none", repeat_total: 1, repeat_forever: true }, 1), false);
  });

  it("minRepeatTotal counts periods when there are several times", () => {
    assert.equal(minRepeatTotal(3, 2), 2);
    assert.equal(minRepeatTotal(4, 2), 3);
    assert.equal(minRepeatTotal(5, 2), 3);
  });
});

describe("describeRepeatStatus", () => {
  const row = {
    repeat_interval: "daily",
    repeat_total: 4,
    repeat_sent: 12,
    repeat_forever: true,
    repeat_times: ["09:00", "18:00"],
    scheduled_at: "2026-11-03T07:00:00.000Z", // Tue 3 Nov 6:00 pm
    status: "pending",
    enabled: true,
  };
  it("shows a forever series with no total", () => {
    assert.deepEqual(describeRepeatStatus(row), [
      "Repeats daily at 9:00 am & 6:00 pm ∞",
      "12 sent",
      "next Tue 3 Nov 6:00 pm",
    ]);
  });
  it("counts posts for a finite series with several times", () => {
    assert.equal(describeRepeatStatus({ ...row, repeat_forever: false, repeat_sent: 3 })[1], "3 of 8 sent");
  });
});

describe("describePending with times and forever", () => {
  const at = "2026-11-02T22:00:00.000Z"; // Tue 3 Nov 9:00 am
  it("labels the composer button", () => {
    assert.equal(
      describePending({
        scheduledAt: at,
        repeatInterval: "daily",
        repeatTotal: 4,
        repeatForever: true,
        repeatTimes: ["09:00", "18:00"],
      }),
      "Tue 3 Nov 9:00 am & 6:00 pm, daily ∞",
    );
    assert.equal(
      describePending({ scheduledAt: at, repeatInterval: "daily", repeatTotal: 4, repeatTimes: ["09:00", "18:00"] }),
      "Tue 3 Nov 9:00 am & 6:00 pm, daily ×4",
    );
  });
});
