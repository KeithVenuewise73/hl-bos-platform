"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { accountsConfigured } from "./config";
import { claimLocalRecords, setOwner, wipeDevice } from "./store";
import { flushOutbox } from "./sync";
import { readableError, supabase } from "./supabase";

/**
 * Accounts.
 *
 * Reuses HL-BOS identity -- Supabase Auth, the publishable key, the user's own
 * session. There is no second identity system here, no custom token, and no
 * password ever stored by this app.
 *
 * Signing in is NOT a gate in front of the product. A coach who installs this
 * twenty minutes before kickoff should be tracking a game, not filling in a
 * form. Local mode is a real mode, and everything created in it is re-owned by
 * whoever eventually signs in on this device.
 */

export type AuthState =
  /** Still reading any stored session. */
  | { status: "loading" }
  /** This build has no account service at all. Data stays on the device. */
  | { status: "unavailable" }
  | { status: "signed-out" }
  | { status: "signed-in"; userId: string; email: string };

interface AuthApi {
  state: AuthState;
  signUp: (email: string, password: string) => Promise<string | null>;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<string | null>;
  updatePassword: (password: string) => Promise<string | null>;
  deleteAccount: () => Promise<string | null>;
}

const AuthContext = createContext<AuthApi | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(() =>
    accountsConfigured() ? { status: "loading" } : { status: "unavailable" },
  );

  useEffect(() => {
    const client = supabase();
    if (client === null) {
      setOwner(null);
      setState({ status: "unavailable" });
      return;
    }

    let active = true;
    void client.auth.getSession().then(({ data }) => {
      if (!active) return;
      const user = data.session?.user;
      if (user) {
        setOwner(user.id);
        claimLocalRecords(user.id);
        setState({ status: "signed-in", userId: user.id, email: user.email ?? "" });
        void flushOutbox();
      } else {
        setOwner(null);
        setState({ status: "signed-out" });
      }
    });

    const { data: sub } = client.auth.onAuthStateChange((_event, session) => {
      const user = session?.user;
      if (user) {
        setOwner(user.id);
        claimLocalRecords(user.id);
        setState({ status: "signed-in", userId: user.id, email: user.email ?? "" });
        void flushOutbox();
      } else {
        setOwner(null);
        setState({ status: "signed-out" });
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const client = supabase();
    if (client === null) return "This build has no account service configured.";
    const { error } = await client.auth.signUp({ email, password });
    return error ? readableError(error.message) : null;
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const client = supabase();
    if (client === null) return "This build has no account service configured.";
    const { error } = await client.auth.signInWithPassword({ email, password });
    return error ? readableError(error.message) : null;
  }, []);

  const signOut = useCallback(async () => {
    const client = supabase();
    if (client === null) return;
    await client.auth.signOut();
  }, []);

  const sendPasswordReset = useCallback(async (email: string) => {
    const client = supabase();
    if (client === null) return "This build has no account service configured.";
    const redirectTo =
      typeof window !== "undefined" && window.location.protocol.startsWith("http")
        ? `${window.location.origin}/reset-password/`
        : undefined;
    const { error } = await client.auth.resetPasswordForEmail(
      email,
      redirectTo ? { redirectTo } : {},
    );
    return error ? readableError(error.message) : null;
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    const client = supabase();
    if (client === null) return "This build has no account service configured.";
    const { error } = await client.auth.updateUser({ password });
    return error ? readableError(error.message) : null;
  }, []);

  /**
   * Delete the account, permanently.
   *
   * Calls playtime.delete_my_account(), which takes no argument: the row is
   * chosen by auth.uid(), so it cannot be pointed at anyone else. The server
   * deletes the auth user and every team, athlete, game and event cascades
   * away with it. The device copy is then wiped too -- leaving a "deleted"
   * account's roster of children sitting in local storage would make the
   * deletion a lie.
   */
  const deleteAccount = useCallback(async () => {
    const client = supabase();
    if (client === null) return "This build has no account service configured.";
    const { error } = await client.rpc("delete_my_account");
    if (error) return readableError(error.message);
    await client.auth.signOut();
    wipeDevice();
    return null;
  }, []);

  const api = useMemo<AuthApi>(
    () => ({ state, signUp, signIn, signOut, sendPasswordReset, updatePassword, deleteAccount }),
    [state, signUp, signIn, signOut, sendPasswordReset, updatePassword, deleteAccount],
  );

  return <AuthContext.Provider value={api}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthApi {
  const ctx = useContext(AuthContext);
  if (ctx === null) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
