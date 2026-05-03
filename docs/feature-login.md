# Login and Authentication

Source: `pos_frontend/src/pages/LoginPage.jsx` and `pos_frontend/src/context/AuthContext.jsx`

## What it does
- Provides user login and registration.
- Allows backend server URL configuration for the API.
- Stores authenticated user and tenant data in `AuthContext`.

## Who can do what
- Any user can login with email and password.
- Any new user can register a tenant account.
- Once logged in, role-specific app screens are enabled by the returned `user.role`.

## Notes
- There is no frontend role selection on the login screen.
- Roles are determined by the server response and stored in the auth context.
- Server settings are saved in local storage and used by `api` service.
