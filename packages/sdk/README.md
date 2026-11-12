# @ozvi/sdk

Sign [Ozvi](https://ozvi.io) SSO tokens in your backend, so people who are signed in to your app are signed in to the Ozvi widget and board too. Node.js 18+, zero dependencies, MIT.

```sh
npm i @ozvi/sdk
```

```js
import { signOzviToken } from "@ozvi/sdk";

// The widget's token-url, e.g. app.get("/api/ozvi-token", …) or app/api/ozvi-token/route.ts in Next.js
const token = signOzviToken(
  { id: user.id, email: user.email, name: user.name,
    traits: { company: org.name, plan: org.plan, mrr: 2900 } },   // shown to your team only
  process.env.OZVI_SSO_SECRET,                                       // board settings → Sign-in
);
```

- `id` (required) is the person's stable id in your app; `role` can be `member` (default), `team` or `admin`; `locale` sets the board language.
- Tokens live 10 minutes by default (`{ expiresIn }` in seconds); the widget asks for a fresh one when it needs it.
- `verifyOzviToken(token, secret)` checks a token the way Ozvi does, handy in tests.

The token is a standard HS256 JWT, so any language can make one without this package: see [Sign people in](https://ozvi.io/docs/widget#sign-in) for Python and PHP.
