# Bar Hunt

A bar-hopping scavenger hunt that runs in any phone browser and can be added to the home screen like an app. It's free to host and doesn't need a domain or a server.

- **Teams** get a clue, find the bar, and enter the answer there. A correct answer shows the bar name, an optional message, and the next clue.
- **Hosts** set up the bars, choose how many teams there are, and set each team's order (each team can start at a different bar). After a team finishes its route, it gets one final clue to the last bar. You can also hold that clue back until every team is done, then announce an unlock code.

## Put it online for free (GitHub Pages)

1. On GitHub, open this repo and go to **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to *Deploy from a branch*, pick the branch with these files and the `/ (root)` folder, then click **Save**.
3. After a minute the site is live at `https://<your-username>.github.io/<repo-name>/`.

GitHub Pages on a free account only works for **public** repos. That's fine here: answers are encrypted inside each team's link, and your hunt drafts stay in your own browser and are never uploaded.

## Running a hunt

1. Open `…/host.html` (or tap **Build a hunt** on the home page).
2. Add your bars. For each bar, write the **clue that leads to it** and the **answer(s)** teams enter once they're there. The answer can be the bar's name or something they have to find inside, like the word on the chalkboard. List alternate answers with commas.
3. Fill in the **final bar**. If you tick **Hold the final clue**, teams wait on a lock screen until you announce the code.
4. Set the **number of teams**. **Stagger starts** gives every team a different first bar in the same loop. You can also reorder, add, or remove bars for each team by hand.
5. Click **Create team links**, then send each team its link or show them its QR code. **Print host cheat sheet** prints every route with its answers.

Each phone saves its own progress, so refreshing the page or closing the browser doesn't lose a team's place. If you edit the hunt after sending links, make new links and send them again.

Use **Save file** to back up a hunt and **Load file** to edit it later or on another computer.

## Files

| Path | What it is |
| --- | --- |
| `index.html` | Home page: join a hunt, resume, install tips |
| `host.html`, `js/host.js` | Hunt builder |
| `play.html`, `js/play.js` | What teams see |
| `js/core.js` | Answer matching, encryption, link packing |
| `sw.js`, `manifest.webmanifest`, `icons/` | Offline support and home-screen install |

If you change any file, bump `VERSION` in `sw.js` so phones pick up the update.
