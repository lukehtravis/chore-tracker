# Chore Tracker

A React-based chore tracking application with Firebase backend, designed to help households track and manage chore assignments and completions.

## Features

- **Calendar View**: Visual calendar showing completed chores with color-coded dots for each person
- **Analysis Dashboard**: 
  - Individual performance tracking with monthly breakdowns
  - House-wide totals and progress
  - Historical data across multiple months
  - Debt tracking (who owes whom chores)
- **Admin Panel**: Manage people, chores, and assignments

## Setup

### Prerequisites

- Node.js (v18 or higher recommended)
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd chore-tracker
```

2. Install dependencies:
```bash
npm install
```

3. Firebase Configuration:
   - Copy `.env.example` to `.env` and fill in your Firebase project values:
   ```bash
   cp .env.example .env
   ```
   - Edit `.env` with your Firebase configuration values
   - Make sure your Firestore database has the following collections (they'll be created automatically):
     - `people` - stores household members
     - `chores` - stores chore definitions
     - `assignments` - stores person-to-chore assignments
     - `completions` - stores completed chore records

4. Start the development server:
```bash
npm run dev
```

The app will be available at `http://localhost:5173`

## Building for Production

To build for GitHub Pages:

1. Update the `base` path in `vite.config.js` to match your GitHub repository name:
```js
base: '/your-repo-name/',
```

2. Build the project:
```bash
npm run build
```

3. The `dist` folder will contain the production-ready files.

## Deploying to GitHub Pages

1. Build the project (see above)

2. Push the `dist` folder contents to the `gh-pages` branch, or use a GitHub Action:

Create `.github/workflows/deploy.yml`:
```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [ main ]

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm install
      
      - name: Build
        run: npm run build
      
      - name: Deploy to GitHub Pages
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./dist
```

3. Enable GitHub Pages in your repository settings to use the `gh-pages` branch

## Project Structure

```
chore-tracker/
├── App.tsx              # Main application component
├── index.html           # HTML entry point
├── src/
│   ├── main.jsx         # React entry point
│   └── index.css        # Tailwind CSS imports
├── package.json         # Dependencies and scripts
├── vite.config.js       # Vite configuration
├── tailwind.config.js   # Tailwind CSS configuration
└── postcss.config.js    # PostCSS configuration
```

## Firebase Collections Schema

### `people`
```javascript
{
  id: string,
  name: string
}
```

### `chores`
```javascript
{
  id: string,
  name: string,
  minutes: number
}
```

### `assignments`
```javascript
{
  id: string,
  personId: string,
  choreId: string,
  timesPerMonth: number
}
```

### `completions`
```javascript
{
  id: string,
  date: string, // Format: "YYYY-MM-DD"
  completedBy: string, // personId
  choreId: string,
  createdAt: string // ISO timestamp
}
```

## How It Works

- **Chore Assignment**: In the Admin panel, assign chores to people with a frequency (times per month)
- **Recording Completions**: Click any day on the calendar to record a completed chore
- **Debt Tracking**: If Person A does a chore assigned to Person B, Person B owes Person A those minutes
- **Analysis**: View individual and house-wide statistics, including monthly breakdowns and historical trends

## License

MIT

