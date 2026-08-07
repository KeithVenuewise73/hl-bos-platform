import { describe, it, expect } from "vitest";
import {
  initialNavState,
  openNav,
  closeNav,
  toggleNav,
  selectItem,
  onKey,
} from "./nav";

describe("navigation state behavior", () => {
  it("starts closed", () => {
    expect(initialNavState.open).toBe(false);
  });

  it("opens and closes", () => {
    expect(openNav().open).toBe(true);
    expect(closeNav().open).toBe(false);
  });

  it("toggles from either state", () => {
    expect(toggleNav({ open: false }).open).toBe(true);
    expect(toggleNav({ open: true }).open).toBe(false);
  });

  it("closes when a navigation item is selected", () => {
    expect(selectItem().open).toBe(false);
  });

  it("closes on Escape and ignores other keys", () => {
    expect(onKey({ open: true }, "Escape").open).toBe(false);
    expect(onKey({ open: true }, "Enter").open).toBe(true);
    expect(onKey({ open: false }, "a").open).toBe(false);
  });
});
