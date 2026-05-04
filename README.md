# StudyDeck

A free, open-source, **local-first** Quizlet alternative. Make flashcards, then play **Match**, **Falling Blocks**, **Test**, or just flip through them. Everything runs in your browser — no accounts, no tracking, no upsells.

> **Live:** [studydeck.pages.dev](https://studydeck.pages.dev) ·  Pure static site · Works offline once loaded.

---

## What's in it

- 📚 **Flashcards** — 3D flip animation, "I knew it / study again" sorting, shuffle, dot navigation
- 🎯 **Match** — drag and click to pair terms with definitions, timed leaderboard
- 🧱 **Falling Blocks** — Gravity-style: type the term before the definition hits the floor. Speeds up. 3 lives.
- 📝 **Test** — generated quiz with multiple-choice + true/false + written answers, immediate feedback, "Restudy missed" replay
- 💾 **Local-first** — sets and scores are stored in IndexedDB on your device. Export / import as JSON.

## Stack

Vanilla HTML / CSS / JS. Zero frameworks, zero build step, zero dependencies. Hash-based router. IndexedDB for persistence. WebAudio for game sounds (no audio files).

## Run locally

It's static — just open `index.html`, or:

```bash
python3 -m http.server 8080
# then visit http://localhost:8080
```

## Deploy

Cloudflare Pages, one command:

```bash
npx wrangler pages deploy . --project-name=studydeck --branch=main
```

## Support / tip

If StudyDeck saves you the cost of a Quizlet Plus subscription:
- 💸 **[Tip via Cash App → $Dryeetsolutions](https://cash.app/$Dryeetsolutions)**
- ⭐ **[Star the repo](https://github.com/bendawg2010/StudyDeck)**

100% goes to keeping this and other open-source projects free.

## Sister projects

- **News Widgets** for macOS — [github.com/bendawg2010/NewsWidgets](https://github.com/bendawg2010/NewsWidgets) · [newswidgets.pages.dev](https://newswidgets.pages.dev)
- **Class Schedule** for macOS — [github.com/bendawg2010/ClassSchedule](https://github.com/bendawg2010/ClassSchedule) · [classschedulewidget.pages.dev](https://classschedulewidget.pages.dev)
- **Scores / F1 Live / Sports News** — [scorewidget.pages.dev](https://scorewidget.pages.dev) · [f1widget.pages.dev](https://f1widget.pages.dev) · [sportsnewswidget.pages.dev](https://sportsnewswidget.pages.dev)

## License

MIT — see [LICENSE](LICENSE).
