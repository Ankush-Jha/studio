# Film Directory

The SuperKreatives Studio Film Directory, a single page listing every film style with its demo film. It's live at
https://ankush-jha.github.io/studio/ and served by GitHub Pages from this repo's `docs/` folder on `main`.

| File | What it is |
|---|---|
| `build.py` | Reads `engines/films/styles/*/style.json` and the posters, writes `docs/` (the page, thumbnails, favicon) |
| `template.html` | The page: SuperKreatives look, grid and sheet views, search, category filter, the player |
| `posters/` | Replacement stills for styles whose `poster.jpg` shows the original project's credit |
| `publish_films.sh` | Pushes the 720p films to the `studio-films` repo, which serves them |

## Update it

```sh
python3 site/build.py --films <folder of 720p films>     # lengths are measured from the films
git add docs site && git commit -m "Film Directory" && git push
```

When a film changes or a style is added, also run `sh site/publish_films.sh <folder of 720p films>`.

To preview locally, serve `docs/` with a `films/` folder of the cuts beside it and build with `STUDIO_FILMS_BASE=films/`.

## Where the films come from

The films are the original project's 720p web cuts (the `web` release of
[lemomo-ai/lemo-opuscar](https://github.com/lemomo-ai/lemo-opuscar/releases/tag/web)), changed so they carry no other brand:

- Each film's end credit is found by OCR (tesseract, then Apple Vision at 2 fps through the whole film) and cut, with a 0.6 s fade.
- Spy Titles opens on an "A LEMOLAB PICTURE" card, so it starts at 5.7 s.
- News Package also has its "LEMO" channel name removed from every frame.
- Posters that show the credit are replaced by a still from inside the film (`posters/`).

Films, posters and stills are CC BY 4.0, so the page footer and the `studio-films` README credit the original project.
