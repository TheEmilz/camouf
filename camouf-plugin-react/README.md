# camouf-plugin-react

React-specific rules for [Camouf](https://github.com/TheEmilz/camouf) — catches AI-generated React code errors that traditional linters miss.

[![npm version](https://img.shields.io/npm/v/camouf-plugin-react.svg)](https://www.npmjs.com/package/camouf-plugin-react)

## Why This Plugin?

AI coding assistants generate React code that compiles but fails at runtime. This plugin catches:

- **Missing hook dependencies** — useEffect that runs on wrong triggers
- **Stale closures** — setInterval/event listeners with captured state
- **Inconsistent naming** — Components that don't follow PascalCase
- **Prop drilling** — Excessive prop passing through component trees

## Installation

```bash
npm install --save-dev camouf-plugin-react camouf
```

## Configuration

Add to your `camouf.config.json`:

```json
{
  "plugins": [
    {
      "name": "camouf-plugin-react",
      "config": {}
    }
  ],
  "rules": {
    "plugin": {
      "react/missing-dependency-array": "warning",
      "react/inconsistent-component-naming": "warning",
      "react/prop-drilling-detection": "warning",
      "react/stale-closure-patterns": "warning"
    }
  }
}
```

## Rules

### `react/missing-dependency-array`

Detects React hooks with missing variables in dependency arrays.

**AI Error Pattern:** AI forgets to add used variables to the dependency array.

```tsx
// Bad - AI generates this:
useEffect(() => {
  fetchData(userId);
}, []); // userId missing!

// Good - Should be:
useEffect(() => {
  fetchData(userId);
}, [userId]);
```

**Configuration:**

```json
{
  "react/missing-dependency-array": {
    "severity": "warning",
    "hooks": ["useEffect", "useCallback", "useMemo", "useLayoutEffect"]
  }
}
```

---

### `react/inconsistent-component-naming`

Detects React components not following PascalCase naming convention.

**AI Error Pattern:** AI switches between naming conventions mid-session.

```tsx
// Bad - AI generates this:
function userProfile() { // Should be UserProfile
  return <div>...</div>;
}

// Good - Should be:
function UserProfile() {
  return <div>...</div>;
}
```

**Configuration:**

```json
{
  "react/inconsistent-component-naming": {
    "severity": "warning",
    "enforcePascalCase": true,
    "checkFileNames": true
  }
}
```

---

### `react/prop-drilling-detection`

Detects props passed through multiple component layers without use.

**AI Error Pattern:** AI copies props through components instead of using Context.

```tsx
// Bad - AI generates deep prop drilling:
<App user={user}>           // receives user
  <Layout user={user}>      // receives, passes down
    <Sidebar user={user}>   // receives, passes down
      <UserInfo user={user} /> // finally uses it!
    </Sidebar>
  </Layout>
</App>

// Good - Should use Context:
<UserContext.Provider value={user}>
  <App>
    <Layout>
      <Sidebar>
        <UserInfo /> {/* useContext(UserContext) */}
      </Sidebar>
    </Layout>
  </App>
</UserContext.Provider>
```

**Configuration:**

```json
{
  "react/prop-drilling-detection": {
    "severity": "warning",
    "maxDepth": 3,
    "ignoreCommonProps": true
  }
}
```

---

### `react/stale-closure-patterns`

Detects potential stale closure issues in React hooks.

**AI Error Pattern:** AI creates closures that capture stale state values.

```tsx
// Bad - AI generates this:
useEffect(() => {
  const interval = setInterval(() => {
    console.log(count); // Always logs initial value!
    setCount(count + 1); // Always sets to 1!
  }, 1000);
  return () => clearInterval(interval);
}, []);

// Good - Should use functional update:
useEffect(() => {
  const interval = setInterval(() => {
    setCount(c => c + 1); // Functional update
  }, 1000);
  return () => clearInterval(interval);
}, []);
```

**Configuration:**

```json
{
  "react/stale-closure-patterns": {
    "severity": "warning",
    "checkIntervals": true,
    "checkEventListeners": true,
    "checkAsyncCallbacks": true
  }
}
```

## Example Output

```
camouf validate

[ERROR] react/missing-dependency-array
  src/components/UserProfile.tsx:15
  useEffect is missing 2 dependencies: userId, fetchUser
  Suggestion: Add missing dependencies to the array: [userId, fetchUser]

[WARNING] react/stale-closure-patterns
  src/hooks/useCounter.tsx:8
  setInterval callback may have stale closure over: count
  Suggestion: Use functional update (setState(prev => ...)) to access current state

Found 2 violations in 0.5s
```

## Usage with CI/CD

```yaml
# .github/workflows/lint.yml
- name: Run Camouf
  run: npx camouf validate --format github
```

## License

Apache-2.0

## Related

- [Camouf](https://github.com/TheEmilz/camouf) — Main architecture guardrails CLI
- [Why AI Code Needs Different Guardrails](https://github.com/TheEmilz/camouf/blob/main/docs/ai-agent-challenges.md)
