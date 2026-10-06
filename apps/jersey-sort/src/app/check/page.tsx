import { FolderCheck } from "@/components/FolderCheck.tsx";
import { requireUser } from "@/lib/session.ts";

export const dynamic = "force-dynamic";

/**
 * Check Folder: what is in a folder of photos, before anything is imported.
 * Inspection only. The reading happens in the browser, on this computer; the
 * page sends nothing to the server and can write nothing anywhere.
 */
export default async function CheckFolderPage() {
  await requireUser();
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="display text-2xl">Check a folder</h1>
        <p className="mt-1 text-sm text-muted">
          Point JerseySort at a folder of game photos — straight off the camera card or
          wherever you keep them — and see what is there: how many photos, which are
          Canon RAW, when each was taken, and how they split into games by date.
        </p>
      </div>
      <FolderCheck />
    </div>
  );
}
