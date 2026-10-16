import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isSiteActiveOnRoute } from "./dateAlignment.ts";

describe("isSiteActiveOnRoute", () => {
  // 2026-10-16 is a Friday (ISO weekday 5)
  const fridayNow = new Date("2026-10-16T10:00:00Z");

  describe("Single trip (startDate set)", () => {
    it("matches when route date falls within site active window", () => {
      assert.equal(
        isSiteActiveOnRoute([], "2026-10-20", "2026-10-15", "2026-10-25", fridayNow),
        true,
      );
    });

    it("matches on boundary dates (startsOn or endsOn equals route date)", () => {
      assert.equal(
        isSiteActiveOnRoute([], "2026-10-20", "2026-10-20", "2026-10-25", fridayNow),
        true,
      );
      assert.equal(
        isSiteActiveOnRoute([], "2026-10-20", "2026-10-15", "2026-10-20", fridayNow),
        true,
      );
    });

    it("does not match when site has already ended before route date", () => {
      assert.equal(
        isSiteActiveOnRoute([], "2026-10-20", "2026-10-01", "2026-10-19", fridayNow),
        false,
      );
    });

    it("does not match when site starts after route date", () => {
      assert.equal(
        isSiteActiveOnRoute([], "2026-10-20", "2026-10-21", "2026-10-30", fridayNow),
        false,
      );
    });

    it("treats NULL dates as open-ended", () => {
      assert.equal(isSiteActiveOnRoute([], "2026-10-20", null, null, fridayNow), true);
      assert.equal(isSiteActiveOnRoute([], "2026-10-20", "2026-10-15", null, fridayNow), true);
      assert.equal(isSiteActiveOnRoute([], "2026-10-20", null, "2026-10-25", fridayNow), true);
      assert.equal(isSiteActiveOnRoute([], "2026-10-20", null, "2026-10-10", fridayNow), false);
      assert.equal(isSiteActiveOnRoute([], "2026-10-20", "2026-10-25", null, fridayNow), false);
    });
  });

  describe("Weekly route (weekdays set)", () => {
    it("never matches an expired site (endsOn < today)", () => {
      // Yesterday: 2026-10-15
      assert.equal(
        isSiteActiveOnRoute(["friday"], null, "2026-10-01", "2026-10-15", fridayNow),
        false,
      );
    });

    it("matches open-ended site (endsOn == null)", () => {
      assert.equal(
        isSiteActiveOnRoute(["wednesday"], null, "2026-10-01", null, fridayNow),
        true,
      );
    });

    it("matches site active for >= 7 days from window start", () => {
      // 2026-10-16 (Fri) to 2026-10-23 (Fri) is 7 days, holds every weekday
      assert.equal(
        isSiteActiveOnRoute(["wednesday"], null, "2026-10-16", "2026-10-23", fridayNow),
        true,
      );
    });

    it("e.g. a Friday-only site on a Wednesday-only route is ignored", () => {
      // Friday 2026-10-16 to Saturday 2026-10-17
      assert.equal(
        isSiteActiveOnRoute(["wednesday"], null, "2026-10-16", "2026-10-17", fridayNow),
        false,
      );
      assert.equal(
        isSiteActiveOnRoute(["friday"], null, "2026-10-16", "2026-10-17", fridayNow),
        true,
      );
    });

    it("matches upcoming site starting on Monday for a Monday route", () => {
      // Monday 2026-10-19 to Tuesday 2026-10-20
      assert.equal(
        isSiteActiveOnRoute(["monday"], null, "2026-10-19", "2026-10-20", fridayNow),
        true,
      );
      assert.equal(
        isSiteActiveOnRoute(["friday"], null, "2026-10-19", "2026-10-20", fridayNow),
        false,
      );
    });
  });

  describe("Unscheduled route (neither startDate nor weekdays)", () => {
    it("matches when site is active today", () => {
      assert.equal(
        isSiteActiveOnRoute([], null, "2026-10-10", "2026-10-20", fridayNow),
        true,
      );
    });

    it("does not match when site expired before today", () => {
      assert.equal(
        isSiteActiveOnRoute([], null, "2026-10-01", "2026-10-15", fridayNow),
        false,
      );
    });

    it("does not match when site has not started yet", () => {
      assert.equal(
        isSiteActiveOnRoute([], null, "2026-10-17", "2026-10-25", fridayNow),
        false,
      );
    });

    it("matches open-ended site active today", () => {
      assert.equal(isSiteActiveOnRoute([], null, null, null, fridayNow), true);
      assert.equal(isSiteActiveOnRoute([], null, "2026-10-01", null, fridayNow), true);
      assert.equal(isSiteActiveOnRoute([], null, null, "2026-10-20", fridayNow), true);
    });
  });
});
