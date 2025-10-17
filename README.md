# Calendrier

<p align="center">
  <img src="public/icon.png" alt="Calendrier logo" width="180" />
</p>

> Cal"en·dar , n. [OE. kalender, calender, fr. L. kalendarium an interest or account book (cf. F. calendrier, OF. calendier) fr. L. calendue, kalendae, calends. See Calends.]
> 1. An orderly arrangement of the division of time, adapted to the purposes of civil life, as years, months, weeks, and days; also, a register of the year with its divisions; an almanac.
> - W1913

A modern, interactive web application for creating and managing academic course schedules with a visual weekly calendar interface.

## Features

### Core Functionality
- Visual weekly calendar with drag-to-create sessions
- Multi-session course management (lectures, labs, tutorials)
- Customizable settings (12/24-hour time, week start day)
- Dark mode with persistent preference
- Full internationalization (English, Chinese, Polish)

### Import/Export
- JSON export/import for local calendars
- Image export (PNG)
- Print-optimized layouts
- URL-based calendar sharing

### Multi-User Collaboration (Optional Backend)
- User accounts with activation tokens
- Real-time updates via WebSocket
- Access control (owner/write/read privileges)
- Anonymous viewer support with caching

### Progressive Web App
- Offline capable
- Installable on all platforms
- Service worker caching

## Quick Start

### Frontend Only (Local Mode)

```bash
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

### Full Stack (Local + Backend)

**Terminal 1 - Backend:**
```bash
cd worker
npm install
npm run dev
```

**Terminal 2 - Frontend:**
```bash
npm install
npm run dev
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

## Deployment

**Frontend:** Deploy to any static hosting (Vercel, Netlify, Cloudflare Pages, GitHub Pages)
```bash
npm run build
# Deploy dist/ folder
```

**Backend:** Deploy to Cloudflare Workers
```bash
cd worker
wrangler deploy
```

See [DEPLOYMENT.md](./DEPLOYMENT.md) for production deployment procedures.

## Documentation

- [DEPLOYMENT.md](./DEPLOYMENT.md) - Production deployment procedures
- [DEVELOPMENT.md](./DEVELOPMENT.md) - Development environment setup and API reference

## License

Unlicensed.
