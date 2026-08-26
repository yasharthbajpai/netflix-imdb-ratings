# Chrome Web Store publishing checklist

## Before zipping

- [ ] Replace the placeholder icons (`icons/16.png`, `48.png`, `128.png` — currently a flat gold
      square) with real artwork.
- [ ] Load unpacked on a completely fresh Chrome profile and confirm: no permission is granted by
      default, the setup page appears, the permission prompt appears only after clicking **Build
      index**, and ratings appear on Netflix afterward.
- [ ] Confirm `manifest.json` has no unconditional `host_permissions` key — only
      `optional_host_permissions`.
- [ ] Zip **only** `manifest.json`, `icons/`, `src/`. Do not include `store-listing/`, `README.md`,
      or this file.

## Store listing assets

- [ ] Icon 128×128 (from `icons/128.png`, replaced with real art)
- [ ] At least one screenshot, 1280×800 or 640×400, showing the badge on the hover preview card
- [ ] One promo tile, 440×280

## Listing copy

- Name: **Ratings for Netflix**
- Short + full description: both must include *"Not affiliated with, endorsed by, or sponsored by
  Netflix or IMDb."* See `description.txt` for a draft.
- Category: Tools (or Fun / Entertainment, whichever fits at submission time)
- Include the IMDb attribution line: *"Ratings information courtesy of IMDb (imdb.com)."*

## Privacy tab (Developer Dashboard)

- Data collection: **none**. No personal data, no browsing history, nothing is transmitted to any
  server controlled by the developer.
- Justify `optional_host_permissions` / runtime `chrome.permissions.request`: the extension only ever
  requests access to the exact host the user types into the setup page, only at the moment they click
  **Build index**, and only to download a static dataset file — never to track browsing.
- Justify `storage` / `unlimitedStorage`: caches the downloaded ratings index and user settings
  locally in the browser; nothing leaves the device.
- A hosted privacy policy URL may be required by the dashboard even with no data collection — a single
  static page (e.g. GitHub Pages) restating the above is sufficient.

## Registration & review

- [ ] One-time $5 Chrome Web Store developer registration fee, if not already paid.
- [ ] Expect review to take anywhere from hours to several days, and budget for at least one
      resubmission round — permission wording or naming is the most likely first-pass bounce.

## Known accepted risk

This extension guides users to bulk-download IMDb's dataset files for use inside the extension. IMDb's
terms permit personal, non-commercial use; this pattern is a reasonable-but-not-guaranteed reading of
that term, since the extension itself is a shared application rather than a one-off personal script.
This risk is documented here and in the main README, and has been knowingly accepted rather than
avoided (e.g. by switching to a commercially licensed ratings source).
