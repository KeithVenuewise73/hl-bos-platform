// Adapter selection. One place that maps a platform to its implementation, so
// adding a channel is one line here plus one adapter file — and so no caller
// ever branches on platform itself.
import { FacebookPageAdapter } from "./facebook.ts";
import { InstagramAdapter } from "./instagram.ts";
import { LinkedInMemberAdapter } from "./linkedin.ts";
import { MockSocialAdapter } from "./mock.ts";
import type { Fetcher, SocialAdapter, SocialPlatform } from "./provider.ts";
import { TikTokInboxAdapter } from "./tiktok.ts";

export function adapterFor(
  platform: SocialPlatform,
  fetcher: Fetcher = fetch,
): SocialAdapter {
  switch (platform) {
    case "facebook_page":
      return new FacebookPageAdapter(fetcher);
    case "instagram":
      return new InstagramAdapter(fetcher);
    case "linkedin_member":
      return new LinkedInMemberAdapter(fetcher);
    case "tiktok_inbox":
      return new TikTokInboxAdapter(fetcher);
  }
}

export function mockAdapterFor(
  platform: SocialPlatform,
  outcome: "success" | "failure" = "success",
): SocialAdapter {
  return new MockSocialAdapter(platform, outcome);
}
