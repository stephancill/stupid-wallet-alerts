/**
 * Preview the stupid wallet alerts email templates in a browser.
 * Runs the real builders from src/worker/email.ts with sample data and writes
 * a standalone HTML page you can open.
 *
 *   bun scripts/preview-emails.ts   → writes /tmp/wallet-alerts-emails.html
 */
import { writeFileSync } from "node:fs";
import { buildNotificationEmail, buildSignInEmail } from "../src/worker/email";

const MAGIC_LINK =
  "https://wallet-alerts.stupidtech.net/api/auth/verify?token=EXAMPLE_MAGIC_TOKEN&email=you%40example.com";

const signIn = buildSignInEmail({ magicLink: MAGIC_LINK });

const address = "0x91bfe1a0fe8a6b21ee4b542121d6b6c12b19ac06";

type Preview = { name: string; subject: string; html: string };

const previews: Preview[] = [];

// 1. Sign-in magic-link email.
previews.push({
  name: "Sign-in magic link",
  subject: signIn.subject,
  html: signIn.html,
});

// 2. Outgoing native value (Ethereum).
const outgoing = buildNotificationEmail({
  email: "you@example.com",
  walletLabel: "Main wallet",
  data: {
    chainId: 1,
    trackedAddress: address,
    initiatedByTrackedAddress: true,
    blockNumber: "20654321",
    transaction: {
      hash: "0x198a0a1f2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f7f8091a2b3c4d5e",
      index: 42,
      from: address,
      to: "0x00000000000000000000000000000000000dEaD",
      status: "success",
      value: "250000000000000000", // 0.25 ETH
    },
    effects: [],
  },
  resolved: {
    native: {
      symbol: "ETH",
      humanAmount: "0.25",
      usdValue: 627.6,
    },
  },
});
previews.push({
  name: "Outgoing native ETH (Ethereum)",
  subject: outgoing.subject,
  html: outgoing.html,
});

// 3. Incoming ERC-20 (Base).
const erc20 = buildNotificationEmail({
  email: "you@example.com",
  walletLabel: "Treasury",
  data: {
    chainId: 8453,
    trackedAddress: address,
    initiatedByTrackedAddress: false,
    blockNumber: "50655024",
    transaction: {
      hash: "0xabcd1234ef5678901234abcd5678901234abcd5678901234abcd5678901234",
      index: 139,
      from: "0x7a5ed39eb67a6edadaf2a8619c66e9bd1be2d13f",
      to: address,
      status: "success",
      value: "0",
    },
    effects: [
      {
        type: "erc20",
        asset: "USDC",
        from: "0x7a5ed39eb67a6edadaf2a8619c66e9bd1be2d13f",
        to: address,
        amount: "5000000",
      },
    ],
  },
  resolved: {
    effects: [
      {
        type: "erc20",
        asset: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        from: "0x7a5ed39eb67a6edadaf2a8619c66e9bd1be2d13f",
        to: address,
        amount: "5000000",
        symbol: "USDC",
        humanAmount: "5",
        usdValue: 5,
      },
    ],
  },
});
previews.push({ name: "Incoming ERC-20 (Base)", subject: erc20.subject, html: erc20.html });

// 4. Incoming ERC-721 (Optimism).
const erc721 = buildNotificationEmail({
  email: "you@example.com",
  walletLabel: null,
  data: {
    chainId: 10,
    trackedAddress: address,
    initiatedByTrackedAddress: false,
    blockNumber: "156254034",
    transaction: {
      hash: "0x999000111222333444555666777888999aaabbbcccdddeeefff000111222333",
      index: 5,
      from: "0xE3c3f1Cbe7F7cBc6bEF6dE3A8b4C5dD6eF7a8b9C",
      to: address,
      status: "success",
      value: "0",
    },
    effects: [{ type: "erc721", asset: "Lil Nouns", from: "0xE3c3…", to: address, tokenId: "832" }],
  },
  resolved: {
    effects: [
      {
        type: "erc721",
        asset: "0x4b10701b7af9f27b0e7c4f5e3a3e6f6e3f3f3f3",
        from: "0xe7c3…",
        to: address,
        tokenId: "832",
        symbol: "Lil Nouns",
      },
    ],
  },
});
previews.push({ name: "Incoming ERC-721 (Optimism)", subject: erc721.subject, html: erc721.html });

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!,
  );
}

function frame(name: string, subject: string, html: string): string {
  return `<section style="margin:0 0 36px;">
<h3 style="font-family:sans-serif;margin:0 0 4px;">${escapeHtml(name)}</h3>
<p style="font-family:sans-serif;margin:0 0 8px;color:#555;">Subject: <b>${escapeHtml(subject)}</b></p>
<table role="presentation" cellspacing="0" cellpadding="0" style="width:600px;max-width:100%;background:#eef1f5;padding:24px;border:1px solid #d5dae0;"><tr><td>${html}</td></tr></table>
</section>`;
}

const page = `<!doctype html><html><head><meta charset="utf-8"/><title>stupid wallet alerts — email preview</title></head>
<body style="margin:28px;background:#fafafa;">
<h1 style="font-family:sans-serif;font-size:18px;">stupid wallet alerts — email previews</h1>
<p style="font-family:sans-serif;color:#666;">Templates are rendered by sending code; preview shows how they look to recipients.</p>
${previews.map((p) => frame(p.name, p.subject, p.html)).join("\n")}
</body></html>`;

writeFileSync("/tmp/wallet-alerts-emails.html", page);
console.log("Wrote /tmp/wallet-alerts-emails.html");
console.log("Previews: " + previews.map((p) => `"${p.subject}"`).join(" · "));
