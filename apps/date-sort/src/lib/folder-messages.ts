/**
 * What DateSort says when "Publish to 5 Star" or "Find jersey numbers" is
 * pressed for a date whose folder is not ready. Each message names the exact
 * button to press (as it is labelled on the screen) and what that button does,
 * so nobody has to work out which "Copy" is meant.
 *
 * Free of `server-only` so it can be tested.
 */

export type Purpose = "publish" | "jersey";

/** The button on the date card that makes the folder, or renames and finishes it. */
export const COPY_BUTTON = '"Create folder & copy photos"';
/** The same button once the date has been copied in this session. */
const COPY_AGAIN = '"Copy again…"';

/** The button that was pressed, as labelled on the card. */
export function actionButton(purpose: Purpose): string {
  return purpose === "publish" ? '"Publish to 5 Star"' : '"Find jersey numbers"';
}

/** No destination folder has ever been chosen. */
export function noDestinationMessage(purpose: Purpose): string {
  return `No folder has been chosen for the dated folders yet. Click Browse… in the "Copy to dated folders" panel above and pick one, then press the button above that says ${COPY_BUTTON}, then press ${actionButton(purpose)} again.`;
}

/**
 * The date has exactly one folder on the drive, but its name is not the one
 * the card now wants (an event name or sport was added or changed, or the
 * folder was renamed in File Explorer). Pressing the copy button renames it.
 */
export function renameMessage(
  purpose: Purpose,
  folderOnDrive: string,
  folderWanted: string,
): string {
  return `This date's folder on your drive is "${folderOnDrive}", but this card now says "${folderWanted}". Press the button above that says ${COPY_BUTTON} (or ${COPY_AGAIN}) to rename the folder to match: nothing is copied twice. Then press ${actionButton(purpose)} again.`;
}

/** No folder for this date on the drive yet. */
export function notCopiedMessage(purpose: Purpose): string {
  return `This date is not in a folder on your drive yet. Press the button above that says ${COPY_BUTTON}, then press ${actionButton(purpose)} again.`;
}
