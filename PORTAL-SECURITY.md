# Portal security key

Every Admin and Merchant controller request now requires both the shared app key and the normal user/session permissions (login itself establishes the user session).

- Web: the Expo API server reads `ACCRABASKET_APP_KEY` from its environment or local `.env.local`. Never use an `EXPO_PUBLIC_` variable for this key.
- Native: enter the key on the sign-in screen. It is saved with the portal session in SecureStore and cleared on logout. Distribute it only to authorized portal users; it is a shared access credential, not a replacement for account permissions.
- PHP website: open `/accrabasket/portal-access.php` over HTTPS, enter the key, then sign in. The HttpOnly, Secure cookie expires after eight hours. Missing keys return 403; missing server configuration returns 503.

## Deployment

Use the same 64-character hex value on both servers. A value was generated locally in `.env.local` and `../accrabasket/config/security.local.php`; neither should be committed or printed in logs. Configure `ACCRABASKET_APP_KEY` in the production Expo and PHP process environments, or securely deploy the PHP local configuration file. PHP reads the environment first.

Deploy the updated app API routes and `src/services/portal-fetch.server.ts`. On Accrabasket deploy `module/Admin/Module.php`, `config/portal-key.php`, `portal-access.php`, and the matching secret configuration. The earlier inventory handler must also be deployed.

Restart the Expo server after adding/changing environment values. Reload PHP workers if environment configuration changes. All existing portal clients must supply `X-Accrabasket-App-Key` or use the portal-access cookie. Deploy both sides together to avoid interrupted access. Key rotation invalidates existing PHP access cookies and native stored keys; users must enter the replacement key.

The standalone `/api/usercontroller/loginuser` identity service and PHP files outside Admin/Merchant controllers are outside this guard. The app still needs the key-checked portal login before it establishes an authenticated app session.
