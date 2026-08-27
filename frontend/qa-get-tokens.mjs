import fs from 'fs';

async function login(email) {
  const res = await fetch('http://localhost:8000/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username: email, password: 'QaTest123!' }),
  });
  const tokens = await res.json();
  if (!tokens.access_token) throw new Error(`login failed for ${email}: ${JSON.stringify(tokens)}`);
  const meRes = await fetch('http://localhost:8000/api/v1/users/me', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const user = await meRes.json();
  return { ...tokens, user };
}

const out = {};
for (const email of ['qa-empresa@rematar-demo.com', 'qa-rematador@rematar-demo.com', 'qa-comprador@rematar-demo.com']) {
  out[email] = await login(email);
  console.log('OK', email, out[email].user?.role);
}
fs.writeFileSync('qa-tokens.json', JSON.stringify(out, null, 2));
console.log('saved to qa-tokens.json');
