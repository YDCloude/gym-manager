# Gym Manager

A personal workout tracker built for your phone at the gym, on top of the
[exercises-dataset](https://github.com/hasaneyldrm/exercises-dataset) (1,324 exercises with images and animations).
No account, no backend: your workouts are saved on the device you use.

## Use it on your phone

A phone needs a **secure (https) web address** to install the app and work offline. You have two ways to get there.

### 1. Preview on your home Wi-Fi (2 minutes, no hosting)

1. On the PC, double-click **`start-phone.bat`**. It prints an address like `http://192.168.1.20:8765/`.
2. Open that address in the phone's browser (same Wi-Fi). Allow Python through the Windows firewall if asked.

This works as a normal web page. It cannot be installed or used offline, and the phone only reaches it while the PC is on.
Data saved this way belongs to that address, so move it to the hosted version later with *Settings > Backup*.

### 2. Host it (free, then install on the phone and use offline)

```
python build.py
```

creates `dist/` (about 1 MB). Upload that folder to any static host, for example
**GitHub Pages**, **Cloudflare Pages** or **Netlify** (drag and drop `dist/`). Then, on the phone:

* **iPhone (Safari):** open the address, Share, **Add to Home Screen**.
* **Android (Chrome):** open the address, menu, **Install app**.
* Open **Settings > Save images** once, on good signal, so the whole library works offline.

The hosted build does not contain the exercise pictures. It loads them from the original dataset repository
(through the jsDelivr CDN) and keeps what you have seen on the phone. The pictures belong to Gym visual; check
their terms (`assets/MEDIA-NOTICE.md`) before sharing the hosted address publicly. Keeping the address to yourself
is the safest option.

## What it does

| Screen | Purpose |
|---|---|
| **Today** | Today's planned workout with a Start button, week at a glance, weekly goal, streak, recent records |
| **Workout** | Name the session (e.g. "Chest day"), add exercises, log weight and reps per set. Last time's numbers are pre-filled, the timer, set count and **Finish** stay pinned at the top, a rest timer starts when you tick a set, the screen stays on, and a trophy badge appears when you beat a record |
| **Plan** | Set each weekday: name, focus, exercises with target sets x reps, rest days. Templates: Push/Pull/Legs, Upper/Lower, Body-part split, Full body |
| **Library** | Search/filter all exercises (body part, equipment, muscle), favourites, create your own, your history per exercise |
| **Progress / History** | Weekly consistency, per-exercise trend (top weight, estimated 1RM, volume), sets per body part, body-weight log; calendar of training days with repeat/edit/delete |
| **Settings** | kg/lb, rest timer, keep-screen-on, install, offline images, theme, backup/restore (with Share on phones), reset |

## Your data

Saved in the browser's `localStorage` under `gymmanager.v1`, per device and per web address.
Installed apps are the safest place (iOS can clear data of websites you have not opened for a week).
Use **Settings > Download backup** (or **Share backup** on a phone) now and then.

## Desktop

`start.bat` runs it on http://localhost:8765/. On a wide screen it switches to a sidebar layout.

## Project layout

```
index.html, manifest.webmanifest, sw.js   app shell, install info, offline support
config.js             where exercise images come from (local copy, or the CDN in dist/)
css/styles.css        styles (phone first, light/dark)
js/util.js            DOM helper, dates, formatting
js/store.js           state, persistence, history/PR queries
js/catalog.js         exercise search + plan templates
js/ui.js              modals, toasts, rest timer, exercise browser
js/charts.js          SVG charts
js/views/*.js         one file per screen
js/app.js             router, nav, wake lock, install, offline registration
data/exercises.js     English-only slice of the dataset
assets/images|videos  thumbnails and GIFs from the dataset (180x180), used locally
icons/                app icons (regenerate with tools/make_icons.py)
server.py             tiny static server (start.bat, start-phone.bat)
build.py              builds the small hosted copy in dist/
```

## Credits and licence

Exercise data: MIT (see `assets/DATASET-LICENSE`). Images and animations are (c) Gym visual,
https://gymvisual.com/, and remain under their terms (see `assets/MEDIA-NOTICE.md`).
