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

Either:

- double-click **`scripts\DateSort.bat`**. The first time it sets itself up (a few
  minutes), and after that it opens in seconds. Or
- press **Start DateSort** on the Development Control Center's home page.

Both start DateSort at `http://localhost:4604` and open it in your browser once it
answers. It listens on this computer only. Leave the DateSort window open while you
use it, and close it to stop.

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

## Not built yet

| Step | What                                                                                                 |
| ---- | ---------------------------------------------------------------------------------------------------- |
| 2    | View Gallery (thumbnails, made on demand, never in the source folder) and Name Event                 |
| 3    | Create Folder: choose and remember a destination, **copy only**, skip duplicates safely              |
| 4    | Two games on one day: show 60+ minute gaps as "Possible second event" and split only on confirmation |

## Verifying it

```
pnpm --filter @hl-bos/date-sort test       # the engine: formats, date rules, CR3/HEIC readers, report, read-only guard
pnpm --filter @hl-bos/date-sort-app test   # the app: request guard, formatting, folder window, no writes
node scripts/local-test/verify-date-sort.cjs   # end to end in a browser, against the running app
```

The Windows run is `.github/workflows/date-sort-windows.yml`.
