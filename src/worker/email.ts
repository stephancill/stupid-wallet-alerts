import { formatEther } from "viem";
import type { Env } from "./lib/env";

/** Chain metadata used in emails. */
export const CHAINS: Record<number, { name: string; short: string }> = {
  1: { name: "Ethereum", short: "eth" },
  42161: { name: "Arbitrum", short: "arb" },
  10: { name: "Optimism", short: "op" },
  8453: { name: "Base", short: "base" },
  137: { name: "Polygon", short: "matic" },
  100: { name: "Gnosis", short: "gno" },
  43114: { name: "Avalanche", short: "avax" },
  56: { name: "BNB Smart Chain", short: "bsc" },
  250: { name: "Fantom", short: "ftm" },
  32520: { name: "Brise", short: "brise" },
  11155111: { name: "Sepolia", short: "sepolia" },
  84532: { name: "Base Sepolia", short: "base-sep" },
};

export function chainName(chainId: number): string {
  return CHAINS[chainId]?.name ?? `Chain ${chainId}`;
}

export interface EventData {
  chainId: number;
  trackedAddress: string;
  initiatedByTrackedAddress: boolean;
  blockNumber: string;
  transaction: {
    hash: string;
    from: string;
    to: string | null;
    status: string;
    value: string;
  };
  effects: Array<{
    interface?: string;
    type?: string;
    asset?: string;
    from?: string;
    to?: string;
    amount?: string;
    tokenId?: string;
    [k: string]: unknown;
  }>;
}

function shortAddr(address: string | null | undefined, len = 6): string {
  if (!address) return "—";
  try {
    return `${address.slice(0, 2 + len)}…${address.slice(-len)}`;
  } catch {
    return address;
  }
}

function statusLabel(status: string): string {
  return status === "success" ? "success" : "reverted";
}

/** Build the "X activity" notification email for a single event. */
export function buildNotificationEmail(params: {
  email: string;
  walletLabel: string | null;
  data: EventData;
}) {
  const { walletLabel, data } = params;
  const chain = chainName(data.chainId);
  const dir = data.initiatedByTrackedAddress ? "sent from" : "on";
  const tx = data.transaction;

  const effectLines = (data.effects ?? []).map((e) => {
    if (e.type === "erc721") {
      return `${e.asset ?? "NFT"} #${e.tokenId ?? "?"} transferred (721)`;
    }
    if (e.type === "erc20") {
      return `${e.amount ?? "0"} ${e.asset ?? "token"} (ERC-20)`;
    }
    return "token transfer";
  });

  const description =
    effectLines.length > 0
      ? effectLines.join(" · ")
      : `Native value${ethAmountNote(tx.value)} on ${chain}`;

  const subject = `Activity ${dir} ${chain} · ${walletLabel?.trim() ?? shortAddr(data.trackedAddress)}`;

  const text = [
    `Activity detected on ${chain}.`,
    ``,
    `Tracking: ${data.trackedAddress}`,
    `Label: ${walletLabel ?? "—"}`,
    ``,
    `Description: ${description}`,
    `Direction: ${dir === "on" ? "incoming" : "outgoing"}`,
    `Status: ${statusLabel(tx.status)}`,
    ``,
    `TX: ${data.blockNumber} via ${data.transaction.hash}`,
    ``,
    `— stupid wallet alerts`,
  ].join("\n");

  const html = `
    <div style="font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#111;max-width:560px;margin:0 auto;">
      <h2 style="font-size:18px;margin:0 0 12px;">${data.initiatedByTrackedAddress ? "Outgoing" : "Incoming"} · ${chain}</h2>
      <p style="margin:0 0 16px;font-size:15px;">${description}</p>
      <ul style="margin:0 0 16px;padding:0;list-style:none;font-size:13px;line-height:1.6;">
        <li>Label: ${walletLabel ?? "—"}</li>
        <li>Status: ${statusLabel(tx.status)}</li>
        <li>From: ${tx.from}</li>
        <li>To: ${tx.to ?? "—"}</li>
        <li>Hash: ${tx.hash}</li>
      </ul>
      <p style="font-size:12px;color:#666;margin:0;">You're getting this because ${data.trackedAddress} is on your watch list.</p>
    </div>`;

  return { subject: subject.replace(/[^\x20-\x7E]/g, ""), text, html: html.trim(), description };
}

function ethAmountNote(value: string): string {
  if (!value || value === "0") return "(zero-value)";
  return formatEther(BigInt(value)) + " ETH";
}

/** Magic link sign-in email. */
export function buildSignInEmail(params: { magicLink: string }): {
  subject: string;
  text: string;
  html: string;
} {
  const { magicLink } = params;
  const subject = "Sign in to stupid wallet alerts";
  const text = [
    "Sign in to stupid wallet alerts",
    "",
    `Use this link to sign in (expires in 30 minutes):`,
    magicLink,
    "",
    "If you didn't request this, you can ignore this email.",
  ].join("\n");
  const html = `
    <div style="font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#111;max-width:560px;margin:0 auto;">
      <h2 style="font-size:18px;margin:0 0 12px;">Sign in to stupid wallet alerts</h2>
      <p style="margin:0 0 12px;"><a href="${magicLink}">Sign in to stupid wallet alerts</a></p>
      <p style="font-size:13px;color:#666;margin:0;">This link expires in 30 minutes. If you didn't request this, ignore this email.</p>
    </div>`;
  return { subject, text, html };
}

/** Send an email through the Cloudflare Email Service binding. */
export async function sendEmail(
  env: Env,
  to: string,
  message: { subject: string; text: string; html: string },
): Promise<void> {
  await env.EMAIL.send({
    from: { email: env.EMAIL_FROM, name: "stupid wallet alerts" },
    to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
}
