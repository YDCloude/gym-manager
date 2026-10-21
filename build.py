"""Build a small copy of the app for hosting:  python build.py   ->  dist/

The 138 MB of exercise images/GIFs are NOT copied. The hosted app loads them from the
original exercises-dataset repository through the jsDelivr CDN instead, so the hosted
site only contains the app code and the MIT-licensed exercise data (about 1 MB).
"""
import os
import re
import shutil

ROOT = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(ROOT, "dist")
DATASET_COMMIT = "7455efae41b330c265e7cd4b78dfa848e7ce5ebd"  # pinned so the media URLs never change
CDN = "https://cdn.jsdelivr.net/gh/hasaneyldrm/exercises-dataset@" + DATASET_COMMIT

CONFIG = """/* Hosted build: exercise media is loaded from the original dataset repository (via jsDelivr). */
window.GM_CONFIG = {
  imageBase: '%s/images/',
  gifBase: '%s/videos/',
};
""" % (CDN, CDN)

HEADERS = """# Netlify / Cloudflare Pages: always revalidate the app files so updates reach the phone.
/
  Cache-Control: no-cache
/index.html
  Cache-Control: no-cache
/sw.js
  Cache-Control: no-cache
/*.js
  Cache-Control: no-cache
/*.css
  Cache-Control: no-cache
"""


def sw_shell_files():
    src = open(os.path.join(ROOT, "sw.js"), encoding="utf-8").read()
    block = re.search(r"const SHELL = \[(.*?)\];", src, re.S).group(1)
    return [f for f in re.findall(r"'([^']+)'", block) if f != "./"]


def main():
    if os.path.isdir(DIST):
        shutil.rmtree(DIST)
    os.makedirs(DIST)
    files = sw_shell_files() + ["sw.js"]
    for rel in sorted(set(files)):
        if rel == "config.js":
            continue
        dst = os.path.join(DIST, rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copy2(os.path.join(ROOT, rel), dst)
    with open(os.path.join(DIST, "config.js"), "w", encoding="utf-8") as f:
        f.write(CONFIG)
    with open(os.path.join(DIST, "_headers"), "w", encoding="utf-8") as f:
        f.write(HEADERS)
    open(os.path.join(DIST, ".nojekyll"), "w").close()  # GitHub Pages: serve files as-is
    size = sum(os.path.getsize(os.path.join(d, n)) for d, _, ns in os.walk(DIST) for n in ns)
    print("Built dist/ with %d files, %.2f MB" % (sum(len(ns) for _, _, ns in os.walk(DIST)), size / 1e6))
    print("Exercise media will load from:", CDN)


if __name__ == "__main__":
    main()
