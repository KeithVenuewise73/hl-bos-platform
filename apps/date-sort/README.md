# DateSort

**Loose camera photos, grouped by the day they were taken.**

You copy a Canon card to the laptop and get hundreds or thousands of loose
photos. DateSort reads each photo's camera date and shows them as one card per
shooting day, ready to become a game folder. It runs on this computer only. It
has no account, no database, no internet connection and no AI.

DateSort and JerseySort are separate apps. DateSort organizes the master library
(camera photos → date → event folder). JerseySort analyzes one event (event folder →
team → jersey number → player galleries). Neither imports the other's code.

## Start it

Double-click the **DateSort** icon on the desktop. You can also use **`scripts\DateSort.bat`**, or **Start DateSort** on the Development Control Center's home page.

All three start DateSort at `http://localhost:4604` and open it in your browser once it answers. It listens on this computer only. Leave the DateSort window open while you use it, and close it to stop. The first start sets things up (a few minutes); later starts take seconds.

**Updates arrive by themselves.** Each time the icon or `DateSort.bat` starts DateSort, it first collects any finished work from GitHub, using the same updater as the Control Center (`scripts/update.mjs`). That updater fast-forwards only, leaves a folder with unsaved changes alone, and never stops DateSort from starting: with no internet it says so in one line and starts the copy already there. If new code arrived, DateSort reinstalls and rebuilds what changed before it opens. It also leaves the Control Center a note (`.hlbos\console-needs-rebuild`), so the console rebuilds on its next start too. If DateSort is already running, a second start just opens it; updates are checked the next time it starts.

The desktop icon is made **once**, the first time HL-BOS starts on a computer (from the Control Center or `DateSort.bat`), by `scripts/desktop-shortcut.mjs`. If you delete it, it stays deleted. Delete `.hlbos\desktop-shortcut.json` to get it back on the next start.

## Step 1: Scan and report (built)

1. **Browse…** opens the normal Windows "choose a folder" window. You can also paste
   a path instead.
2. **Include subfolders** scans every folder inside the chosen one as well. Shortcuts
   to other folders are listed, not followed.
3. **Scan** produces the report: files scanned, photos, JPG/JPEG, PNG, HEIC, CR2, CR3,
   files that are not photos, earliest and latest photo, number of shooting dates,
   and how many dates came from the camera versus were estimated.
4. You get **one card per shooting day**: the number of photos, a count by file type,
   the first and last photo time, and camera dates versus estimated dates.

### Where a photo's date comes from

| Order | Source                                               | Shown as           |
| ----- | ---------------------------------------------------- | ------------------ |
| 1     | EXIF **DateTimeOriginal** (shutter time)             | camera date        |
| 2     | EXIF **CreateDate**                                  | camera date        |
| 3     | the file's **Date Modified**, only if neither exists | **Estimated date** |

EXIF **DateTime** ("ModifyDate") is **never** used. It records when the file was last
edited, so trusting it would move an edited photo to the day it was edited. Camera
times are used exactly as the camera recorded them, with no time-zone conversion.

Canon **CR3** and **HEIC** dates are read by DateSort's own metadata readers
(`packages/date-sort/src/cr3.ts`, `heif.ts`). The general EXIF library can't open
CR3. Both readers are checked against ExifTool on real Canon files
(`packages/date-sort/fixtures`).

### Read-only, by construction

Scanning never moves, renames, edits, deletes or re-dates a file, and never
creates anything in the source folder. Three things back this up:

- **One file touches the disk.** All disk access goes through
  `packages/date-sort/src/read-only-file.ts`, which can only list folders, read file
  details and open files with mode `"r"`. A test fails the build if that file ever
  imports a write function, or if any other file imports the filesystem.
- **The EXIF library gets bytes, not paths.** It is handed bytes DateSort has already
  read, so it can't open a file itself.
- **Every scan is fingerprinted.** The Windows CI test records each file's path, size,
  modified time and SHA-256 before and after every scan, and fails on any difference.

The API refuses requests from any other web page, so a website open in another tab
can't make DateSort scan a folder or open a folder window.

## Step 3: Create folders and copy photos (built)

Under **Copy to dated folders**:

1. Choose where the date folders go: **Browse…**, or type a path. DateSort remembers it in
   `%LOCALAPPDATA%\DateSort\settings.json`.
2. Optionally type an **event name** on a date card. The card shows the folder name it will use:
   `2026-10-04`, or `2026-10-04 - Caz vs Wheatfield`.
3. Press **Create folder & copy photos** on a card for one date, or **Copy all N dates**.

The rules (`packages/date-sort/src/copy`):

- **Copy only.** Originals are opened for reading, never moved, renamed, edited or deleted.
- **Never overwrites.** If a file of that name is already in the folder, it is compared byte for byte.
  The same photo counts as "already there"; a different file is **left alone** and listed.
- **Checked.** Each copy is written under a temporary name, read back and compared with its original
  (SHA-256), given the original's dates, and only then given its real name. A copy cut short (power
  loss, unplugged drive) is never mistaken for a photo. Drives without hard links (exFAT) are handled.
- **Same name, different photo.** Canon numbering restarts after IMG_9999, so one date can hold two
  different `IMG_0001.JPG`. The second copy is named `IMG_0001 (2).JPG`, the same way every time.
- **Safe to repeat.** Pressing it again only copies what is missing, so an interrupted copy is
  finished by pressing the button again.
- **The laptop stays awake while it copies.** A laptop that goes to sleep cuts the page off from
  DateSort, which stops the copy (cleanly). So while a copy runs, DateSort asks Windows not to
  sleep (`src/lib/keep-awake.ts`, the same request a video player makes), and lets go when the copy
  ends or DateSort closes. The screen can still turn off. Closing the lid still sleeps, so the page
  says to keep it open. A Windows test checks with `powercfg /requests` that Windows really sees
  the request, and that it is gone afterwards. If the copy is cut off anyway, the page says so in
  plain words and says to press the button again.
- **Refused:** a destination inside the scanned folder, a destination that does not exist, or not
  enough free space (checked before anything is written).

## Not built yet

| Step | What                                                                                                 |
| ---- | ---------------------------------------------------------------------------------------------------- |
| 2    | View Gallery (thumbnails, made on demand, never in the source folder)                                |
| 4    | Two games on one day: show 60+ minute gaps as "Possible second event" and split only on confirmation |
| —    | A camera clock correction ("this camera was N hours off"), if real scans show the clock was wrong    |

## Verifying it

```
pnpm --filter @hl-bos/date-sort test       # the engine: formats, date rules, CR3/HEIC readers, report, read-only guard
pnpm --filter @hl-bos/date-sort-app test   # the app: request guard, formatting, folder window, no writes
node scripts/local-test/verify-date-sort.cjs   # end to end in a browser, against the running app
```

The Windows run is `.github/workflows/date-sort-windows.yml`.
