# Chore Tracker

A chore tracking application with Firebase backend, designed to help households track and manage chore assignments and completions. This application provides a calendar-based interface for recording chore completions, tracks individual and household performance metrics, and models chore debts as first-class records when someone does a chore for someone else.

**Key Feature: Credit Assignment System**
- When someone does a chore for another person, the **credit goes to the person the chore was done FOR**, not the person who did it
- Credits are "provisional" until the debt is paid or expires
- Expired debts trigger retroactive stats adjustment

## Original Requirements

The application was built to fulfill the following requirements:

- **Calendar View**: Month-by-month visual calendar (like pages of a calendar)
- **People Management**: Arbitrarily defined number of people, each with a regular allocation of chores
- **Chore Definition**: Each chore has a name and is worth a specific number of minutes
- **Chore Frequency**: Each chore can be done an arbitrary number of times per month
- **Performance Tracking**: Track minutes of chores completed as a percentage of expected allocation
- **Admin Screen**: Set up chores, people, and assignments (who does what, how many times per month)
- **Calendar Screen**: Click on any day to record completed chores
- **Analysis Screen**:
  - Individual performance (total time, percentage of expected, monthly breakdown)
  - House-wide totals and percentages
  - Long-term history per person
  - Debt tracking (who owes whom specific chores and minutes when chores are done for others)

## Features

- **Calendar View**: Visual calendar showing completed chores with color-coded dots for each person
  - Credits are assigned to the person the chore was done FOR (not the doer)
  - Provisional credits are visually indicated with dashed borders
- **Analysis Dashboard**:
  - Individual performance tracking with monthly breakdowns
  - **Adjusted Stats**: Toggle to view stats excluding expired debt credits
  - House-wide totals and progress
  - Historical data across multiple months (3, 6, or 12 month views)
  - Debt tracking (who owes whom chores, with per-debt detail and progress)
  - Expired debt indicators and expiration status
  - Chore completion status tracking
- **Credit Assignment System**:
  - Cross-person completions credit the recipient (not the doer)
  - Provisional credits until debts are paid or expire
  - Automatic retroactive stats adjustment when debts expire
- **Admin Panel**: Manage people, chores, and assignments
- **Day-Specific Chores**: Optional day-of-week assignments for recurring weekly chores

## Architecture

### Technology Stack

- **Frontend**: React 18 with Vite
- **Styling**: Tailwind CSS 3.4
- **Backend**: Firebase Firestore (NoSQL database)
- **Deployment**: GitHub Pages
- **Build Tool**: Vite 5

### Application Structure

The application is a single-page application (SPA) with three main views:

1. **Calendar View** (`CalendarView` component)
2. **Analysis View** (`AnalysisView` component)
3. **Admin View** (`AdminView` component)

All data is stored in Firebase Firestore and synchronized in real-time using `onSnapshot` listeners. The application uses a single-file architecture with all components defined in `App.tsx`.

## Data Structure Model

### Firebase Collections

The application uses six Firestore collections:

#### 1. `people` Collection

Stores household members.

```typescript
interface Person {
  id: string;           // Unique identifier (generated)
  name: string;         // Display name of the person
}
```

**Operations:**

- Create: Add new person via Admin panel
- Read: Real-time listener syncs all people
- Delete: Removes person and all their assignments (cascade delete)

#### 2. `chores` Collection

Stores chore definitions with time values.

```typescript
interface Chore {
  id: string;           // Unique identifier (generated)
  name: string;         // Name of the chore (e.g., "Dishes", "Vacuum")
  minutes: number;      // Time value in minutes for completing this chore
}
```

**Operations:**

- Create: Add new chore with name and minutes via Admin panel
- Read: Real-time listener syncs all chores
- Delete: Removes chore and all related assignments (cascade delete)

#### 3. `assignments` Collection

Stores person-to-chore assignments with frequency and optional day specificity.

```typescript
interface Assignment {
  id: string;                    // Unique identifier (generated or reused if updating)
  personId: string;               // Reference to person.id
  choreId: string;               // Reference to chore.id
  timesPerMonth: number;         // How many times per month this person should do this chore
  dayOfWeek?: number | null;     // Optional: 0-6 (Sunday-Saturday) for day-specific chores
}
```

**Key Behaviors:**

- **Regular Assignments**: When `dayOfWeek` is `undefined` or `null`, the chore can be done any day
- **Day-Specific Assignments**: When `dayOfWeek` is set (0-6), the assignment only applies to that day of the week
- **Uniqueness**: For regular chores, only one assignment per person-chore pair. For day-specific, one per person-chore-dayOfWeek combination
- **Update Logic**: If an assignment already exists (matching person, chore, and optionally dayOfWeek), it updates the existing record instead of creating a duplicate

**Operations:**

- Create/Update: Assign chore to person with frequency and optional day
- Read: Real-time listener syncs all assignments
- Delete: Remove specific assignment

#### 4. `completions` Collection

Stores records of completed chores.

```typescript
interface Completion {
  id: string;           // Unique identifier (generated)
  date: string;         // Date in "YYYY-MM-DD" format
  completedBy: string;  // Reference to person.id (who did the chore)
  choreId: string;      // Reference to chore.id (which chore was done)
  minutes: number;      // Minutes recorded for this completion (full or partial)
  createdAt: string;    // ISO timestamp of when the record was created
  forPersonId: string | null; // Reference to person.id this chore was done for (can be same as completedBy)
  isProvisional?: boolean;    // true if this completion created a debt that hasn't been paid/expired
  sourceDebtId?: string;      // If this completion created a debt, reference it
}
```

**Key Behaviors:**

- **Credit Assignment**: Credits go to `forPersonId` (not `completedBy`) for cross-person completions. This means when Person A does a chore for Person B, Person B gets the credit toward their stats.
- **Provisional Credits**: When a cross-person completion creates a new debt, the credit is marked as "provisional" until the debt is paid or expires.
- **Self-Completions**: If `forPersonId === completedBy`, credit goes to `completedBy` (normal behavior).

**Operations:**

- Create: Record completion via calendar day click
- Read: Real-time listener syncs all completions
- Update: `isProvisional` is set to `false` when the associated debt is fully paid
- Delete: Not currently implemented in UI (would require manual Firestore deletion)

#### 5. `debts` Collection

Stores chore debts as explicit obligations between two people, created when someone does a chore for someone else and there is no existing debt in that direction.

```typescript
interface Debt {
  id: string;               // Unique identifier (generated)
  creditorId: string;       // Person who is owed time (did the original favor)
  debtorId: string;         // Person who owes time back
  choreId: string;          // Chore that created this debt
  originalMinutes: number;  // Total minutes of the original favor
  remainingMinutes: number; // Minutes still owed on this debt
  createdAt: string;        // ISO timestamp when the debt was created
  dueDate: string | null;   // Due date (YYYY-MM-DD) for paying back the favor
  sourceCompletionId: string; // ID of completion that created this debt
  expiredAt?: string;       // ISO timestamp when debt expired (set when dueDate passes and not fully paid)
  feeCalculated: boolean;   // true if fees have been calculated for this expired debt (for future use)
}
```

**Key Behaviors:**

- **Expiration**: A debt expires when `dueDate < today` AND `remainingMinutes > 0`. The system automatically detects and marks expired debts.
- **Payment**: When a debt is fully paid (`remainingMinutes <= 0`), the source completion's `isProvisional` is set to `false`, making the credit permanent.

**Operations:**

- Create: When a cross-person completion is recorded and there are no existing debts from debtor to creditor
- Read: Real-time listener syncs all debts
- Update: 
  - `remainingMinutes` is reduced automatically as payments are applied
  - `expiredAt` is set automatically when debt expires
  - `feeCalculated` is set when fees are calculated (for future Task 2)

#### 6. `debtPayments` Collection

Stores how individual chore completions pay down existing debts.

```typescript
interface DebtPayment {
  id: string;            // Unique identifier (generated)
  debtId: string;        // Reference to debt.id
  completionId: string;  // Reference to completion.id used as payment
  minutesApplied: number; // Minutes from this completion applied to the debt
  createdAt: string;     // ISO timestamp when payment was recorded
}
```

**Operations:**

- Create: When a cross-person completion is recorded and there are existing debts from debtor to creditor
- Read: (Optional) for audit/history views or debugging

### Data Relationships

```text
Person (1) ──< (many) Assignment (many) >── (1) Chore
Person (1) ──< (many) Completion (many) >── (1) Chore
```

- One person can have many assignments
- One chore can be assigned to many people
- One person can complete many chores
- One chore can be completed many times

## Business Logic & Calculations

### Expected Minutes Calculation

For a given person and time period:

```typescript
expectedMinutes = sum(
  for each assignment where personId === person.id:
    chore.minutes * assignment.timesPerMonth * monthMultiplier
)
```

Where `monthMultiplier` is:
- `1` for a specific month filter
- `getMonthsSinceStart()` for all-time calculations (number of months since first completion)

### Completed Minutes Calculation

For a given person and time period:

```typescript
completedMinutes = sum(
  for each completion where:
    // Self-completion: credit goes to completedBy
    (completion.forPersonId === completion.completedBy || !completion.forPersonId) 
      && completion.completedBy === person.id
    OR
    // Cross-person completion: credit goes to forPersonId
    completion.forPersonId === person.id:
    completion.minutes
)
```

**Key Change:** Credits are assigned based on `forPersonId`, not `completedBy`. This means when Person A does a chore for Person B, Person B gets the credit toward their completion stats.

Filtered by date range if calculating for a specific month.

### Percentage Calculation

```typescript
percentage = expectedMinutes > 0 
  ? Math.round((completedMinutes / expectedMinutes) * 100)
  : 0
```

### Credit Assignment & Provisional Credits

**Core Principle:** Credits go to the person the chore was done FOR (`forPersonId`), not the person who did it (`completedBy`). This ensures that when someone does a favor for another person, the credit counts toward the recipient's obligations.

1. **Self-Completions** (`forPersonId === completedBy`):
   - Credit goes to `completedBy`
   - No debt is created
   - Credit is permanent (not provisional)

2. **Cross-Person Completions** (`forPersonId !== completedBy`):
   - Credit goes to `forPersonId` (the person the chore was done for)
   - Credit is **provisional** until the debt is paid or expires
   - Completion is marked with `isProvisional: true` and `sourceDebtId` when a new debt is created

### Debt Calculation

Debts are tracked as explicit `Debt` documents and are based on **who a chore was done for**, not inferred automatically from assignments.

1. **Recording a cross-person completion**:
   - When recording a completion, the user selects both:
     - **Who did the chore** (`completedBy`)
     - **Who it was done for** (`forPersonId`)
   - If `forPersonId` is empty or equals `completedBy`, no debt logic is applied.
   - If `forPersonId !== completedBy`, this is treated as a favor from `completedBy` (creditor) to `forPersonId` (debtor).
   - **Credit Assignment**: The completion counts toward `forPersonId`'s stats (not `completedBy`'s).

2. **Finding existing debts (oldest-first auto payment)**:
   - For a cross-person completion where `completedBy = X` and `forPersonId = Y`, the system looks for open debts where:
     - `debtorId === X` and `creditorId === Y`
     - `remainingMinutes > 0`
   - If such debts exist, the completion is treated as a **payment**:
     - The completion's minutes are applied oldest-first across those debts.
     - For each application:
       - A `DebtPayment` record is created.
       - The corresponding `Debt.remainingMinutes` is reduced.
     - When a debt is fully paid (`remainingMinutes <= 0`), the source completion's `isProvisional` is set to `false`.

3. **Creating new debts**:
   - If no open debts exist from `completedBy` to `forPersonId` when recording a cross-person completion, a **new `Debt` document** is created:
     - `creditorId = completedBy`
     - `debtorId = forPersonId`
     - `originalMinutes = remainingMinutes = completion.minutes`
     - `dueDate` is manually selected in the UI when saving the completion.
     - The source completion is marked with `isProvisional: true` and `sourceDebtId: debtId`.

4. **Debt expiration**:
   - A debt expires when `dueDate < today` AND `remainingMinutes > 0`.
   - When a debt expires:
     - `expiredAt` is set to the current timestamp
     - The provisional credit from the source completion is removed from stats calculations (retroactive adjustment)
     - Expired debts are visually distinguished in the UI (strikethrough, grayed out)

5. **Debt status**:
   - In the UI, debts are labeled based on:
     - `remainingMinutes <= 0` → **Paid**
     - `remainingMinutes > 0` and `expiredAt` is set → **Expired**
     - `remainingMinutes > 0` and `dueDate` in the past → **Overdue**
     - Otherwise → **Open**

### Retroactive Stats Adjustment

When a debt expires, the system retroactively adjusts the stats for the month in which the debt was created:

1. **Calculate adjusted stats**: Stats are recalculated excluding the expired debt's provisional credit
2. **Display options**: Users can toggle between "current stats" (with provisional credits) and "adjusted stats" (without expired debt credits) in the Analysis view
3. **Visual indicators**: Provisional credits are marked in the calendar view, and expired debts are clearly indicated in the debt display

This ensures that expired debts don't permanently inflate completion percentages, while still maintaining a clear audit trail of what happened.

### Month Key Format

Months are identified using the format `"YYYY-MM"` (e.g., `"2024-03"`). This is used for:
- Filtering completions by month
- Grouping data in history views
- Date comparisons

## User Flows

### 1. Initial Setup (Admin View)

1. Navigate to Admin panel
2. **Add People**: Enter names to create household members
3. **Add Chores**: Create chore definitions with names and minute values
4. **Create Assignments**: 
   - Select person, chore, and frequency (times per month)
   - Optionally mark as "day-specific" and select a day of week
   - System prevents duplicate assignments

### 2. Recording Completions (Calendar View)

1. Navigate to Calendar view
2. Click on any day in the calendar
3. Modal opens showing:
   - Selected date (formatted as "Weekday, Month Day, Year")
   - Dropdown to select who did the chore
   - Dropdown to select which chore was done
   - Checkbox and selector for partial completions (optional)
   - Dropdown to select **who the chore was done for** (can be the same person)
   - If the chore is done for someone else and will create a new debt, a **due date** field is required
   - Note indicating who will receive credit (the person the chore was done for)
4. Click "Save" to record the completion
5. Calendar updates in real-time with color-coded dots showing completions:
   - Dots are colored based on who gets credit (`forPersonId`), not who did it
   - Provisional credits are indicated with a dashed border
   - Tooltips show completion details including provisional status

### 3. Viewing Analysis (Analysis View)

1. Navigate to Analysis view
2. Select month using navigation arrows
3. Choose tab:
   - **Individual**: See each person's stats for current month and all-time
     - Toggle "Show adjusted stats" to exclude expired debt credits
     - See both current stats (with provisional credits) and adjusted stats (without expired debts)
   - **House Total**: Aggregate statistics and chore completion status
   - **History**: Multi-month table showing trends (3, 6, or 12 months)
   - **Debts**: Per-person view of debts owed and owed-to, with per-debt details:
     - Shows expiration status (expired debts are visually distinguished)
     - Displays which completion created each debt
     - Shows expiration dates for expired debts

## Component Architecture

### Main App Component

- Manages global state (people, chores, assignments, completions)
- Sets up Firebase real-time listeners
- Handles view navigation
- Renders header with navigation tabs

### CalendarView Component

**Props:**
- `currentMonth`: Date object for displayed month
- `setCurrentMonth`: Function to change month
- `completions`: Array of all completions
- `people`: Array of all people
- `chores`: Array of all chores
- `selectedDate`: Currently selected date string
- `setSelectedDate`: Function to set selected date
- `showRecordModal`: Boolean for modal visibility
- `setShowRecordModal`: Function to toggle modal
- `assignments`: Array of all assignments
- `db`: Firestore database instance

**Features:**
- Month navigation (previous/next)
- Color-coded legend for people
- Calendar grid with day cells
- Click handler to open record modal
- Visual indicators for today
- Completion dots with chore names (truncated if >10 chars)
- **Credit Assignment**: Dots are colored based on who gets credit (`forPersonId`), not who did the chore
- **Provisional Indicators**: Provisional credits show with a dashed border
- **Tooltips**: Show completion details including who did it and provisional status

### RecordChoreModal Component

**Props:**
- `date`: Date string in "YYYY-MM-DD" format
- `people`: Array of all people
- `chores`: Array of all chores
- `assignments`: Array of all assignments (not currently used in modal)
- `debts`: Array of all debts (used to determine whether a cross-person completion is a new debt or a payment)
- `onClose`: Function to close modal
- `db`: Firestore database instance

**Features:**
- Form to select:
  - Who did the chore
  - Which chore was done
  - Whether it was a partial completion and how many minutes
  - **Who the chore was done for**
- Saves completion record to Firestore with `forPersonId`
- Automatically:
  - Creates a new `Debt` (with manual due date) when a favor is done for someone and no existing debts exist in that direction
  - Applies payments oldest-first to existing debts when the debtor does a chore for the creditor
- Formatted date display

### AnalysisView Component

**Props:**
- `people`: Array of all people
- `chores`: Array of all chores
- `assignments`: Array of all assignments
- `completions`: Array of all completions
- `currentMonth`: Date object for analysis month
- `setCurrentMonth`: Function to change month
- `debts`: Array of all debts

**Features:**
- Tab navigation (Individual, House Total, History, Debts)
- Month navigation
- Progress rings for visual percentage display
- History table with configurable time range (3/6/12 months)
- Debt calculation and display
- Chore breakdown per person
- **Adjusted Stats Toggle**: View stats with or without expired debt credits
- **Expired Debt Indicators**: Visual distinction for expired debts in the "Who Owes Who" tab

**Key Functions:**
- `calculatePersonStats(personId, monthFilter)`: Calculates expected, completed, percentage, and breakdown
- `houseStats()`: Aggregates all people's stats for current month
- `getLastNMonths(n)`: Generates array of month objects for history view

### AdminView Component

**Props:**
- `people`: Array of all people
- `chores`: Array of all chores
- `assignments`: Array of all assignments
- `db`: Firestore database instance

**Features:**
- Tab navigation (People, Chores, Assignments)
- CRUD operations for people
- CRUD operations for chores
- CRUD operations for assignments
- Day-specific assignment option
- Cascade delete (deleting person/chore also deletes assignments)

### ProgressRing Component

**Props:**
- `percentage`: Number (0-100)
- `size`: Number (default 64)
- `strokeWidth`: Number (default 4)

**Features:**
- SVG circular progress indicator
- Color coding based on percentage:
  - 100%+: Green (#81b29a)
  - 75-99%: Yellow (#f2cc8f)
  - 50-74%: Orange (#e07a5f)
  - <50%: Red (#ef4444)

## Utility Functions

### `generateId()`

Generates a random 9-character alphanumeric ID using `Math.random()`.

### `getMonthKey(date)`

Converts a Date object to "YYYY-MM" format string.

### `getDaysInMonth(year, month)`

Returns the number of days in a given month (0-indexed).

### `getFirstDayOfMonth(year, month)`

Returns the day of week (0-6, Sunday-Saturday) for the first day of a month.

## Setup

### Prerequisites

- Node.js (v18 or higher recommended)
- npm or yarn
- Firebase project with Firestore enabled

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
   - Create a Firebase project at https://console.firebase.google.com
   - Enable Firestore Database
   - Get your Firebase configuration values
   - Create a `.env` file in the root directory:

   ```bash
   VITE_FIREBASE_API_KEY=your-api-key
   VITE_FIREBASE_AUTH_DOMAIN=your-auth-domain
   VITE_FIREBASE_PROJECT_ID=your-project-id
   VITE_FIREBASE_STORAGE_BUCKET=your-storage-bucket
   VITE_FIREBASE_MESSAGING_SENDER_ID=your-messaging-sender-id
   VITE_FIREBASE_APP_ID=your-app-id
   ```
   - Firestore collections will be created automatically on first use
   - Configure Firestore security rules as needed (default rules allow all reads/writes)

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
        env:
          VITE_FIREBASE_API_KEY: ${{ secrets.VITE_FIREBASE_API_KEY }}
          VITE_FIREBASE_AUTH_DOMAIN: ${{ secrets.VITE_FIREBASE_AUTH_DOMAIN }}
          VITE_FIREBASE_PROJECT_ID: ${{ secrets.VITE_FIREBASE_PROJECT_ID }}
          VITE_FIREBASE_STORAGE_BUCKET: ${{ secrets.VITE_FIREBASE_STORAGE_BUCKET }}
          VITE_FIREBASE_MESSAGING_SENDER_ID: ${{ secrets.VITE_FIREBASE_MESSAGING_SENDER_ID }}
          VITE_FIREBASE_APP_ID: ${{ secrets.VITE_FIREBASE_APP_ID }}
      
      - name: Deploy to GitHub Pages
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./dist
```

3. Add Firebase environment variables as GitHub Secrets
4. Enable GitHub Pages in your repository settings to use the `gh-pages` branch

## Project Structure

```
chore-tracker/
├── App.tsx              # Main application component (all components in single file)
├── index.html           # HTML entry point
├── src/
│   ├── main.jsx         # React entry point
│   └── index.css        # Tailwind CSS imports
├── package.json         # Dependencies and scripts
├── vite.config.js       # Vite configuration (includes base path for GitHub Pages)
├── tailwind.config.js   # Tailwind CSS configuration
├── postcss.config.js    # PostCSS configuration
└── .env                 # Firebase configuration (not in git)
```

## Key Implementation Details

### Real-Time Data Synchronization

All data is synchronized in real-time using Firebase `onSnapshot` listeners. When any user makes a change, all connected clients see the update immediately without page refresh.

### Date Handling

- Dates are stored as strings in "YYYY-MM-DD" format for consistency
- Month keys use "YYYY-MM" format for filtering
- JavaScript Date objects are used for calculations and display formatting

### Color Assignment

People are assigned colors from a predefined palette based on their index in the people array. Colors cycle if there are more people than colors.

### Day-Specific Chore Logic

When an assignment has a `dayOfWeek` value:
- The assignment only applies to that day of the week
- Multiple assignments can exist for the same person-chore pair if they have different `dayOfWeek` values

### History View Filtering

The history view automatically filters out months where no one has any completions (except the current month) to prevent skewed averages from missing data.

## Future Improvement Opportunities

1. **Completion Editing/Deletion**: Add UI to edit or delete completion records
2. **Bulk Operations**: Allow recording multiple completions at once
3. **Chore Templates**: Pre-defined chore sets for common household types
4. **Notifications**: Remind people of upcoming or overdue chores
5. **Export/Import**: Export data to CSV or JSON for backup
6. **Authentication**: Add user authentication to restrict admin access
7. **Multi-Household Support**: Support multiple households in one Firebase project
8. **Mobile App**: Native mobile app using React Native
9. **Chore Scheduling**: Visual schedule view showing when chores should be done
10. **Statistics Enhancements**: Charts, graphs, and trend analysis
11. **Recurring Completions**: Mark completions as recurring to auto-populate future dates
12. **Chore Categories**: Group chores by category (cleaning, cooking, maintenance, etc.)

## License

MIT

