# HRMS Mobile App

Comprehensive cross-platform mobile app for HRMS with employee attendance, leave management, and admin features using React Native (Expo).

## Features

### Authentication
- **Email/Password Login**: Traditional login method
- **Phone OTP Login**: SMS-based authentication
- **Session Management**: Persistent login with AsyncStorage
- **Auto Token Refresh**: Automatic token handling

### Employee Features
- **Dashboard**: Overview with statistics and quick actions
- **Attendance**: GPS-based check-in/check-out with location capture
- **Attendance History**: View past attendance records with status
- **Leave Requests**: Submit leave requests with multiple leave types
- **Profile Management**: Update profile and change password

### Admin Features
- **Employee Management**: Add, edit, view, and delete employees
- **Employee Search**: Quick search through employee list
- **Leave Approvals**: Review and approve/reject leave requests
- **Dashboard Stats**: View organization-wide statistics
- **Role-Based Access**: Admin-only features protected by role checks

### Technical Features
- **GPS Location**: Automatic location capture for attendance
- **Offline Support**: AsyncStorage for local data persistence
- **Role-Based Navigation**: Different tabs for different user roles
- **Bottom Tab Navigation**: Easy navigation between sections
- **Modal Forms**: Clean UI for adding/editing data
- **Error Handling**: Comprehensive error messages and alerts
- **Loading States**: Activity indicators for async operations

## Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- Expo CLI
- Android Studio (for Android development)
- Xcode (for iOS development - macOS only)

## Installation

1. Install dependencies:
```bash
cd hrms_mobile
npm install
```

2. Start the development server:
```bash
npm start
```

3. Run on specific platform:
```bash
# Android
npm run android

# iOS
npm run ios

# Web
npm run web
```

## Configuration

Update the API base URL in `src/services/api.js`:
```javascript
const API_BASE_URL = 'http://YOUR_BACKEND_URL/api';
```

## Permissions

The app requires the following permissions:
- **Location**: For GPS-based attendance tracking
- **Camera**: For future selfie verification (optional)

## Backend API Endpoints Used

### Authentication
- `POST /api/auth/login` - Email/password login
- `POST /api/auth/send-otp` - Send OTP to phone
- `POST /api/auth/verify-otp` - Verify OTP and login
- `GET /api/auth/me` - Get current user info
- `PUT /api/auth/me` - Update profile
- `POST /api/auth/change-password` - Change password

### Attendance
- `GET /api/attendance` - Get attendance records
- `POST /api/attendance/check-in` - Check in with location
- `POST /api/attendance/check-out` - Check out with location

### Employees (Admin)
- `GET /api/employees` - List all employees
- `POST /api/employees` - Add new employee
- `GET /api/employees/{id}` - Get employee details
- `PUT /api/employees/{id}` - Update employee
- `DELETE /api/employees/{id}` - Delete employee

### Leaves
- `GET /api/leaves` - Get leave requests
- `POST /api/leaves` - Submit leave request
- `PUT /api/leaves/{id}/approve` - Approve leave
- `PUT /api/leaves/{id}/reject` - Reject leave

### Dashboard
- `GET /api/dashboard/stats` - Get dashboard statistics

## Project Structure

```
hrms_mobile/
├── App.js                          # Main app entry point with navigation
├── app.json                        # Expo configuration
├── package.json                    # Dependencies
├── README.md                       # Documentation
└── src/
    ├── context/
    │   └── AuthContext.js         # Authentication context & state
    ├── screens/
    │   ├── LoginScreen.js         # Login with email/OTP
    │   ├── DashboardScreen.js     # Dashboard with stats
    │   ├── AttendanceScreen.js    # Check-in/out with GPS
    │   ├── AttendanceHistoryScreen.js  # Attendance history
    │   ├── EmployeeListScreen.js  # Employee list (admin)
    │   ├── EmployeeDetailScreen.js    # Employee details/edit
    │   ├── LeaveRequestScreen.js     # Submit leave request
    │   ├── LeaveApprovalScreen.js    # Approve/reject leaves (admin)
    │   └── ProfileScreen.js      # Profile & settings
    └── services/
        └── api.js                 # API service with axios
```

## User Roles

### Employee
- View dashboard
- Mark attendance (check-in/check-out)
- View attendance history
- Submit leave requests
- Manage profile

### Admin / HR Admin / Superadmin
- All employee features plus:
- Manage employees (add, edit, delete)
- Approve/reject leave requests
- View organization statistics
- Access employee management tab

## Development

### Adding New Screens

1. Create screen in `src/screens/`
2. Add to navigation in `App.js`
3. Use `useAuth` hook for authentication
4. Use `api` service for API calls

### API Integration

Use the `api` service from `src/services/api.js` for all API calls. It automatically includes the authentication token.

```javascript
import api from '../services/api';

const response = await api.get('/endpoint');
const data = response.data;
```

### Role-Based Features

Check user role to conditionally show features:

```javascript
const { user } = useAuth();
const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';

if (isAdmin) {
  // Show admin features
}
```

## Building for Production

### Android
```bash
eas build --platform android
```

### iOS
```bash
eas build --platform ios
```

## Troubleshooting

### Location Permission Denied
- Ensure location permissions are granted in device settings
- On Android, check if "Allow all the time" permission is needed
- Verify location services are enabled

### API Connection Issues
- Ensure backend server is running
- Check if API_BASE_URL is correct in `src/services/api.js`
- Verify network connectivity
- Check if CORS is enabled on backend

### Navigation Issues
- Ensure all screens are properly imported in `App.js`
- Check that screen names match in navigation
- Verify role-based conditional rendering

### Authentication Issues
- Clear AsyncStorage if token is corrupted
- Check backend login endpoint is working
- Verify token format in API headers

## Future Enhancements

- [ ] Selfie verification for check-in/out
- [ ] Offline mode with sync
- [ ] Push notifications
- [ ] Pay slip viewing
- [ ] Biometric authentication (Face ID/Touch ID)
- [ ] Document upload (ID proofs, certificates)
- [ ] Holiday calendar
- [ ] Team chat/messaging
- [ ] Expense submission
- [ ] Performance reviews
- [ ] Training modules

## Support

For issues or questions, please contact the development team.
