# Calendrier

<p align="center">
  <img src="public/icon.png" alt="Calendrier logo" width="180" />
</p>

> Cal"en·dar , n. [OE. kalender, calender, fr. L. kalendarium an interest or account book (cf. F. calendrier, OF. calendier) fr. L. calendue, kalendae, calends. See Calends.]
> 1. An orderly arrangement of the division of time, adapted to the purposes of civil life, as years, months, weeks, and days; also, a register of the year with its divisions; an almanac.
> - W1913

A modern, interactive web application for creating and managing academic course schedules with a visual weekly calendar interface.

Release candidate: frontend `0.1.0-rc.2`, Worker `1.0.1-rc.2`.

## Features

### Core Functionality
- Visual weekly calendar with drag-to-create sessions
- Multi-session course management (lectures, labs, tutorials)
- Date-aware weekly, bounded, and one-off sessions with exclusions and occurrence overrides
- Academic-year periods, semester week numbers, breaks, exams, and special dates
- Customizable settings (12/24-hour time, week start day)
- Dark mode with persistent preference
- Full internationalization (English, Chinese, Polish)

### Import/Export
- JSON export/import for local calendars
- iCalendar (`.ics`/`.ical`) imports from files and URLs, including `webcal` feeds
- Image export (PNG)
- Print-optimized layouts
- URL-based imports and revocable public read-only links for server calendars

### Multi-User Collaboration (Optional Backend)
- User accounts with activation tokens
- Real-time updates via WebSocket
- Access control (owner/write/read privileges)
- Public snapshots refresh every minute; owners can revoke links or purge their snapshot cache
- Public views use isolated read-only state and do not load the viewer's private account or calendar

### Progressive Web App
- Web app manifest and service worker for browsers that support installation
- Previously loaded static assets can be used offline; server calendars and public snapshots require a connection
- API responses and public snapshot requests are excluded from service-worker caching

## Quick Start

### Frontend Only (Local Mode)

Use Node.js 24 LTS and Yarn Classic 1.22.22. The root and `worker/` are separate Yarn projects with separate lockfiles; they are not workspaces.

```bash
nvm install
nvm use
corepack enable
corepack prepare yarn@1.22.22 --activate
```

```bash
yarn install --frozen-lockfile
yarn dev
```

Open `http://localhost:5173` in your browser.

### Full Stack (Local + Backend)

**Terminal 1 - Backend:**
```bash
cd worker
yarn install --frozen-lockfile
yarn dev
```

**Terminal 2 - Frontend:**
```bash
yarn install --frozen-lockfile
yarn dev
```

Configure `.env`:
```env
VITE_WORKER_URL=http://localhost:8787
```

See [DEVELOPMENT.md](./DEVELOPMENT.md) for detailed setup instructions.



## Data Format

Calendar data is stored in JSON format:

```json
{
  "title": "Academic Calendar",
  "courses": [
    {
      "id": "uuid",
      "title": "Course Name",
      "color": "#4285f4",
      "sessions": [
        {
          "id": "uuid",
          "meetDay": "Monday",
          "startTime": "09:00",
          "endTime": "10:30",
          "sessionType": "Lecture",
          "location": "Room 101",
          "instructor": "Dr. Smith"
        }
      ]
    }
  ],
  "settings": {
    "timeFormat": "24h",
    "weekStart": "Monday"
  }
}
```

Optional session `schedule` fields preserve dates, recurrence intervals, exclusions, and overrides. Optional settings include `weekView`, `eventTypeIcons`, and `academicCalendar`; see [src/types/Course.ts](./src/types/Course.ts) for the complete model. Import replaces the current calendar after confirmation. ICS conversion supports the implemented recurrence subset; unsupported or skipped events are reported. A representative USOS export still needs validation.

## Validation

```bash
yarn install --frozen-lockfile
yarn --cwd worker install --frozen-lockfile
yarn test
```

This runs ICS scheduling regressions, frontend TypeScript/build/lint, and Worker typecheck/bundling. It does not run browser or deployed integration tests.

## Deployment

**Frontend:** Deploy to any static hosting (Vercel, Netlify, Cloudflare Pages, GitHub Pages)
```bash
yarn build
# Deploy dist/ folder
```

**Backend:** Deploy to Cloudflare Workers
```bash
cd worker
yarn deploy
```

See [DEPLOYMENT.md](./DEPLOYMENT.md) for production deployment procedures.

## Documentation

- [DEPLOYMENT.md](./DEPLOYMENT.md) - Production deployment procedures
- [DEVELOPMENT.md](./DEVELOPMENT.md) - Development environment setup and API reference

## License

Unlicensed.
