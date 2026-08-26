// Vault access for the social module.
//
// social.credentials stores only a reference ("vault:social_fb_page_1"). This
// is the one place that turns a reference into a value, and the one place that
// writes a rotated token back. Nothing else in the module handles a secret.
//
// Reads go through Supabase Vault's decrypted view; writes go through the
// vault RPCs. Both require the service role. A reference that does not resolve
// is an error, never an empty string — an empty token would produce a 401 that
// looks like an expired credential and send you hunting in the wrong place.
import type { SecretResolver } from "./provider.ts";

export interface VaultClient {
  schema(name: string): {
    from(table: string): {
      select(cols: string): {
        eq(
          col: string,
          val: string,
        ): {
          maybeSingle(): Promise<{
            data: { decrypted_secret?: string } | null;
            error: unknown;
          }>;
        };
      };
    };
  };
  rpc(fn: string, args: Record<string, unknown>): Promise<{ error: unknown }>;
}

export function vaultRefToName(ref: string): string {
  if (!ref.startsWith("vault:")) {
    throw new Error(`not a vault reference: ${ref}`);
  }
  return ref.slice("vault:".length);
}

/** Build a resolver bound to a service-role client. */
export function makeVaultResolver(client: VaultClient): SecretResolver {
  return async (ref: string) => {
    const name = vaultRefToName(ref);
    const { data, error } = await client
      .schema("vault")
      .from("decrypted_secrets")
      .select("decrypted_secret")
      .eq("name", name)
      .maybeSingle();
    if (error) throw new Error(`vault read failed for ${ref}`);
    const secret = data?.decrypted_secret;
    if (!secret) throw new Error(`vault reference ${ref} resolved to nothing`);
    return secret;
  };
}

/** Write a rotated token back under the same reference. */
export async function writeVaultSecret(
  client: VaultClient,
  ref: string,
  value: string,
): Promise<void> {
  const name = vaultRefToName(ref);
  const { error } = await client.rpc("update_secret_by_name", {
    p_name: name,
    p_secret: value,
  });
  if (error) throw new Error(`vault write failed for ${ref}`);
}
