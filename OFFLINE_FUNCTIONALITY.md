# Offline-First Functionality

This application now supports full offline functionality with automatic synchronization when internet becomes available.

## Features

### 1. **Persistent Storage with IndexedDB**
- All expense and group data is stored locally in IndexedDB
- Data persists across browser sessions
- No dependency on network connection for viewing data
- Automatic cleanup and management of local data

### 2. **Offline Operations**
When offline, you can:
- View all previously synced expenses and balances
- Create new expenses (stored locally with temporary IDs)
- Update existing expenses
- Delete expenses
- View balance reports and participant details

All changes are tracked and queued for synchronization.

### 3. **Sync Queue System**
- Pending operations are stored in a sync queue
- Operations include: create, update, delete
- Each operation tracks:
  - Operation type
  - Model (expense or group)
  - Data to sync
  - Sync status (pending/syncing/failed)
  - Retry count
  - Error messages (if failed)

### 4. **Automatic Synchronization**
- **On Coming Online**: Automatically syncs pending changes when internet connection is restored
- **Periodic Sync**: Background sync every 3 minutes when online
- **Manual Sync**: Force refresh button to trigger immediate sync
- **Smart Sync**: Only fetches new data since last sync (incremental sync)

### 5. **Sync Status Indicators**
The UI displays real-time sync status:
- **📡 Offline Mode**: No internet connection
- **✓ Synced**: All data is up to date
- **⏳ X pending**: X operations waiting to sync
- **⚠️ X failed**: X operations failed (will retry)
- **Syncing...**: Actively syncing with server

### 6. **Settled Expenses as Opening Balance**
- Expenses marked with `x_studio_is_done: true` are treated as settled
- Settled expenses form the "opening balance" for each participant
- Balance report shows:
  - Opening balance from settled transactions
  - Current credits/debits from unsettled transactions
  - Net balance (opening + current)
- Only unsettled expenses appear in transaction lists

## Architecture

### Storage Layer (`src/lib/db.js`)
- IndexedDB wrapper with simple API
- Object stores:
  - `expenses`: All expense records
  - `groups`: Expense group records
  - `sync_queue`: Pending operations
  - `meta`: Metadata (sync timestamps, etc.)

### Sync Queue (`src/lib/syncQueue.js`)
- Manages offline operations queue
- Handles retry logic (up to 5 attempts)
- Processes queue when online
- Exposes sync status as Svelte store

### Offline Cache Stores
- **`offlineExpenseCache`** (`src/lib/stores/offlineExpenseCache.js`):
  - Manages expense data
  - Provides CRUD operations
  - Handles online/offline transitions
  - Auto-syncs when coming online
  
- **`groupCache`** (`src/lib/stores/groupCache.js`):
  - Manages expense group data
  - Similar offline-first architecture

### Odoo Client (`src/lib/odoo.js`)
- Extended with group model support
- Methods for expense groups:
  - `fetchExpenseGroups()`
  - `createExpenseGroup()`
  - `updateExpenseGroup()`
  - `deleteExpenseGroup()`

## Data Flow

### Creating an Expense (Offline-First)
1. User creates expense in UI
2. Generate temporary local ID (e.g., `local_1234567890_abc123`)
3. Save to IndexedDB immediately with `syncStatus: 'pending'`
4. Add to sync queue
5. Update UI with new expense
6. When online: sync queue processes operation
7. On success: replace local ID with server ID
8. Remove from sync queue

### Synchronization Process
1. Check if online (skip if offline)
2. Process sync queue first (push pending changes)
3. Fetch new data from server (incremental)
4. Merge with local data
5. Save to IndexedDB
6. Update UI

### Online/Offline Detection
- Browser `online` and `offline` events
- Automatic sync trigger when coming online
- Status indicator updates immediately

## Configuration

### Cache Duration
- Expenses: 5 minutes
- Groups: 10 minutes
- Adjustable in respective store files

### Sync Intervals
- Background sync: Every 3 minutes (when online)
- Adjustable in `offlineExpenseCache.js`

### Retry Policy
- Max retries: 5 attempts
- Failed items removed after max retries
- User can manually retry failed items

## Usage

### Using the Offline Cache
```javascript
import { offlineExpenseCache } from '$lib/stores/offlineExpenseCache';

// Initialize on app start
await offlineExpenseCache.initialize();

// Subscribe to data
offlineExpenseCache.subscribe($cache => {
  console.log('Expenses:', $cache.expenses);
  console.log('Balances:', $cache.balances);
  console.log('Is offline:', $cache.isOffline);
});

// Create expense (works offline)
await offlineExpenseCache.createExpense({
  x_name: 'Coffee',
  x_studio_value: 5.50,
  x_studio_who_paid: 1,
  x_studio_participants: [1, 2],
  x_studio_type: 'other',
  x_studio_date: '2025-01-15'
});

// Force refresh
await offlineExpenseCache.forceRefresh();
```

### Monitoring Sync Status
```javascript
import { cacheStatus } from '$lib/stores/offlineExpenseCache';

cacheStatus.subscribe($status => {
  console.log('Loading:', $status.isLoading);
  console.log('Syncing:', $status.isSyncing);
  console.log('Offline:', $status.isOffline);
  console.log('Pending:', $status.pendingSyncCount);
  console.log('Failed:', $status.failedSyncCount);
});
```

## Benefits

1. **Works Offline**: Full functionality without internet
2. **Fast**: Data loads instantly from local storage
3. **Reliable**: No data loss even when offline
4. **Auto-Sync**: Seamless synchronization when online
5. **Conflict-Free**: Operations queued and processed in order
6. **User-Friendly**: Clear status indicators
7. **PWA Ready**: Perfect for Progressive Web App deployment

## Future Enhancements

- [ ] Conflict resolution for concurrent edits
- [ ] Selective sync (sync only specific models)
- [ ] Background sync using Service Worker
- [ ] Differential sync (only changed fields)
- [ ] Compression for large datasets
- [ ] Export/import offline data
- [ ] Multi-device sync status
