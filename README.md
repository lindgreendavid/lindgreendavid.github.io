# David Lindgreen: portfolio site

Personal portfolio for David Lindgreen: data and AI, building towards finance. Live at https://lindgreendavid.com.

Astro, static output, plain CSS tokens (light and dark), one self-hosted variable font. The hero chart plots the ECB EUR/USD reference rate, fetched from the ECB data API when the site is built; a scheduled workflow rebuilds it on weekday mornings.

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # output in dist/
```

All text, projects and links live in `src/data/site.ts`. Colours are tokens in `src/styles/global.css`. Deployment: `.github/workflows/deploy.yml` (GitHub Pages).
