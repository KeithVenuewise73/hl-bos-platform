# Test photos

Small, real files that DateSort's date readers are tested against.
`exiftool-says.json` records what **ExifTool 13.59** (a widely used metadata reader that
shares no code with DateSort) reads from each one. The tests require DateSort to agree.

## Straight from a camera (unmodified)

These come from ExifTool's own test set (`t/images` in github.com/exiftool/exiftool, commit
`2200871d`). They are real camera files with the image data cut down to keep them small,
so the metadata structure is exactly what the camera wrote. Copyright Phil Harvey,
distributed under the same terms as Perl (Artistic License or GPL).

| File                          | Camera                  | Upstream name    | SHA-256 (matches upstream) |
| ----------------------------- | ----------------------- | ---------------- | -------------------------- |
| `canon-eos-m50.cr3`           | Canon EOS M50 (CR3)     | `CanonRaw.cr3`   | `dc02aa55…a918fd6`         |
| `canon-eos-350d.cr2`          | Canon EOS 350D (CR2)    | `CanonRaw.cr2`   | `b5d3d26f…2e9b004b`        |
| `canon-eos-digital-rebel.jpg` | Canon EOS Digital Rebel | `Canon.jpg`      | `98c29028…46d203ca9e7a2`   |
| `heic-no-exif.heic`           | none (HEIF container)   | `QuickTime.heic` | n/a                        |

## Edited copies, to test the order of the date rules

In a real camera file all three dates are the same second, so a reader that used the
wrong one would still pass. These copies were made from the files above with ExifTool so
the three dates **differ** — DateTimeOriginal on 4 October, CreateDate on 5 October,
ModifyDate (EXIF "DateTime", the edit time) on 6 October — or are missing:

| File                         | What it proves                                                |
| ---------------------------- | ------------------------------------------------------------- |
| `cr3-all-three-differ.cr3`   | CR3: DateTimeOriginal wins                                    |
| `cr3-createdate-only.cr3`    | CR3: CreateDate is used when DateTimeOriginal is missing      |
| `cr3-modifydate-only.cr3`    | CR3: ModifyDate alone is NOT a camera date — it is estimated  |
| `cr2-all-three-differ.cr2`   | CR2: DateTimeOriginal wins                                    |
| `jpg-all-three-differ.jpg`   | JPEG: DateTimeOriginal wins                                   |
| `jpg-modifydate-only.jpg`    | JPEG: ModifyDate alone is NOT a camera date — it is estimated |
| `heic-all-three-differ.heic` | HEIC: DateTimeOriginal wins                                   |
| `png-all-three-differ.png`   | PNG: DateTimeOriginal wins                                    |

Made with commands of this form (ExifTool, not DateSort, wrote them):

```
exiftool -ExifIFD:DateTimeOriginal="2026:10:04 13:03:00" \
         -ExifIFD:CreateDate="2026:10:05 09:00:00" \
         -IFD0:ModifyDate="2026:10:06 10:00:00" cr3-all-three-differ.cr3
```

What these do **not** prove: that every Canon body writes its CR3 the same way the M50
does. The first scan of a real card from the camera in use is the test for that.
