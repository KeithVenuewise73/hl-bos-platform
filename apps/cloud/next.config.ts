import type { NextConfig } from "next";

// Herman Legacy Cloud — the HOSTED execution plane of Headquarters.
//
// Unlike the operator plane (apps/control-center), this app is meant to be
// served remotely, so it must expose ONLY operations that are safe to perform
// remotely. It shells out to nothing and holds no service_role; it acts through
// RLS and authenticated APIs. The remote-safety boundary is enforced in the
// ESLint config for apps/cloud (no child_process, no operator-plane modules).
const config: NextConfig = {};

export default config;
