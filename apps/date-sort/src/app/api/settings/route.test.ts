/**
 * The iPhone's folder is chosen once and remembered. It was not: the save
 * accepted it and wrote everything but it, so DateSort asked again every
 * time. Each save must also keep it when saving something else.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const home = await mkdtemp(join(tmpdir(), "datesort-settings-"));
const env = process.env;
const saved = { HOME: env["HOME"], USERPROFILE: env["USERPROFILE"] };

const { GET, POST } = await import("./route");

const local = { host: "127.0.0.1:4604", "Content-Type": "application/json" };
const post = (body: unknown) =>
  POST(
    new Request("http://127.0.0.1:4604/api/settings", {
      method: "POST",
      headers: local,
      body: JSON.stringify(body),
    }),
  );
const read = async () =>
  (await (
    await GET(new Request("http://127.0.0.1:4604/api/settings", { headers: local }))
  ).json()) as { destination: string | null; iphoneFolder: string | null };

describe("remembering the iPhone's folder", () => {
  beforeAll(() => {
    env["HOME"] = home;
    env["USERPROFILE"] = home;
  });
  afterAll(async () => {
    env["HOME"] = saved.HOME;
    env["USERPROFILE"] = saved.USERPROFILE;
    await rm(home, { recursive: true, force: true });
  });

  it("keeps it, and keeps it when the destination is saved later", async () => {
    expect((await post({ iphoneFolder: "D:\\Seagate\\iPhone Photos" })).status).toBe(
      200,
    );
    expect((await read()).iphoneFolder).toBe("D:\\Seagate\\iPhone Photos");
    expect((await post({ destination: "D:\\Seagate\\Sorted" })).status).toBe(200);
    const after = await read();
    expect(after.destination).toBe("D:\\Seagate\\Sorted");
    expect(after.iphoneFolder).toBe("D:\\Seagate\\iPhone Photos");
  });
});
