# @hl-bos/date-sort

DateSort's engine. It reads a folder of camera photos **without changing anything in
it** and groups the photos by the day they were taken.

| File                | Decides                                                                                                                           |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `formats.ts`        | What a file is, from its bytes: JPG/JPEG, PNG, HEIC, Canon CR2, Canon CR3, or not a photo (and why).                              |
| `capture-date.ts`   | The date rule: DateTimeOriginal, then CreateDate, then the file's modified time as an **estimate**. Never EXIF DateTime.          |
| `tiff.ts`           | Reads tags 0x9003 / 0x9004 from a TIFF block. Never reads 0x0132.                                                                 |
| `cr3.ts`            | Canon CR3 dates from the `CMT1`/`CMT2` metadata boxes, reading box headers and those two small blocks only.                       |
| `heif.ts`           | HEIC dates from the EXIF item (`iinf` / `iloc` / `idat`).                                                                         |
| `isobmff.ts`        | Walks the MP4-family box headers that CR3 and HEIC are built from.                                                                |
| `report.ts`         | Totals, per-format counts and one entry per shooting day, with first and last time and camera vs estimated counts.                |
| `scan.ts`           | Walks a folder (subfolders optional, links never followed) and examines each file. Node only: `@hl-bos/date-sort/scan`.           |
| `read-only-file.ts` | **The only file that touches the disk.** It can list folders, read file details and open files with mode `"r"`, and nothing else. |

JPEG, PNG and CR2 dates are read with `exifr`, which is handed bytes, never a path. HEIC
is read by `heif.ts` first and `exifr` second.

`fixtures/` holds real Canon CR3 / CR2 / JPEG files and edited copies whose three dates
differ, plus `exiftool-says.json`: what ExifTool reads from each one. The tests require
DateSort to agree with ExifTool. See `fixtures/README.md`.
