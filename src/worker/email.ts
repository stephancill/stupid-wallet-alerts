import { formatEther, formatUnits } from "viem";
import type { Env } from "./lib/env";
import { getToken } from "./lib/token-info";
import notificationTemplate from "./templates/notification.html?raw";
import signInTemplate from "./templates/sign-in.html?raw";

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

/** A webhook effect enriched with resolved token metadata/price. */
export interface ResolvedEffect {
  type?: string;
  asset?: string;
  from?: string;
  to?: string;
  amount?: string;
  tokenId?: string;
  symbol?: string; // resolved token symbol (erc20)
  humanAmount?: string; // resolved token amount, e.g. "5.00"
  usdValue?: number; // resolved USD value, when price known
}

/** A resolved native (mainnet coin) leg of a transaction. */
export type ResolvedNative = {
  symbol: string;
  humanAmount: string;
  usdValue?: number;
};

function displayAddress(address: string | null | undefined, len = 4): string {
  if (!address) return "—";
  const a = address.toLowerCase();
  return `${a.slice(0, 2 + len)}…${a.slice(-len)}`;
}

function usd(value: number, digits: 0 | 2 = 2): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** Aave-style subject value: "$5" whole dollars, "$0.42" sub-dollar. */
function subjectDollar(value: number): string {
  return usd(value, value >= 1 ? 0 : 2);
}

/** Overall event direction (initiated-by semantics). */
function transferDirection(data: EventData): "received" | "sent" {
  return data.initiatedByTrackedAddress ? "sent" : "received";
}

/** Direction of a single transfer effect relative to the tracked wallet. */
function directionFor(e: ResolvedEffect, trackedAddress: string): "received" | "sent" {
  const tracked = trackedAddress.toLowerCase();
  if (e.to?.toLowerCase() === tracked) return "received";
  if (e.from?.toLowerCase() === tracked) return "sent";
  return "received";
}

/**
 * Fetch token metadata/prices (via DeFiLlama, cached in D1) and compute the
 * display strings for the event's token transfers and native value.
 */
export async function enrichEvent(
  env: Env,
  data: EventData,
): Promise<{ effects: ResolvedEffect[]; native?: ResolvedNative }> {
  const chainId = data.chainId;

  const effects: ResolvedEffect[] = [];
  for (const e of data.effects ?? []) {
    const base: ResolvedEffect = { ...e };
    if (e.type === "erc20") {
      const tok = await getToken(env, chainId, e.asset ?? null);
      if (tok) {
        const human = Number(formatUnits(BigInt(e.amount ?? "0"), tok.decimals));
        base.symbol = tok.symbol;
        base.humanAmount = human.toLocaleString("en-US", {
          maximumFractionDigits: 6,
        });
        base.usdValue = human * tok.priceUsd;
      }
    }
    effects.push(base);
  }

  // Native value: the wallet moved the chain's main coin (tx.value). Only used
  // when there are no priced token effects so we don't double count.
  let native: ResolvedNative | undefined;
  const rawValue = data.transaction?.value;
  const hasPricedToken = effects.some((e) => e.usdValue !== undefined);
  if (!hasPricedToken && rawValue && rawValue !== "0") {
    const nat = await getToken(env, chainId, null, true);
    const human = Number(formatEther(BigInt(rawValue)));
    native = {
      symbol: nat?.symbol ?? "ETH",
      humanAmount: human.toLocaleString("en-US", {
        maximumFractionDigits: 6,
      }),
      usdValue: nat ? human * nat.priceUsd : undefined,
    };
  }

  return { effects, native };
}

/** Build the "X activity" notification email for a single event. */
export function buildNotificationEmail(params: {
  email: string;
  walletLabel: string | null;
  data: EventData;
  resolved?: { effects: ResolvedEffect[]; native?: ResolvedNative };
}) {
  const { walletLabel, data, resolved } = params;
  const chain = chainName(data.chainId);
  const tx = data.transaction;
  const effects = resolved?.effects ?? [];
  const native = resolved?.native;

  const who = `${walletLabel?.trim() || displayAddress(data.trackedAddress)} (${displayAddress(data.trackedAddress)})`;

  // One line per leg: "<label> (<addr>) received/sent $X of <token>".
  const transferLines: string[] = [];
  for (const e of effects) {
    if (e.type === "erc20") {
      const direction = directionFor(e, data.trackedAddress);
      const amount = e.usdValue
        ? `${usd(e.usdValue)} of ${e.symbol ?? "token"}`
        : `${e.humanAmount ?? e.amount ?? "0"} ${e.symbol ?? displayAddress(e.asset)}`;
      transferLines.push(`${who} ${direction} ${amount}`);
    } else if (e.type === "erc721") {
      const direction = directionFor(e, data.trackedAddress);
      transferLines.push(`${who} ${direction} ${e.symbol ?? "NFT"} #${e.tokenId ?? "?"}`);
    }
  }
  if (native) {
    const amount = native.usdValue
      ? `${usd(native.usdValue)} of ${native.symbol}`
      : `${native.humanAmount} ${native.symbol}`;
    transferLines.push(`${who} ${transferDirection(data)} ${amount}`);
  }

  // Subject, Aave style: "You received $5" / "You sent $2.50".
  let subject: string;
  const priced = effects.find((e) => e.usdValue !== undefined);
  if (priced && priced.usdValue !== undefined) {
    subject = `You ${directionFor(priced, data.trackedAddress)} ${subjectDollar(priced.usdValue)}`;
  } else if (native?.usdValue !== undefined) {
    subject = `You ${transferDirection(data)} ${subjectDollar(native.usdValue)} of ${native.symbol}`;
  } else {
    subject = `Activity ${
      transferDirection(data) === "received" ? "received" : "sent"
    } on ${chain} · ${walletLabel?.trim() ?? displayAddress(data.trackedAddress)}`;
  }

  const description =
    transferLines.length > 0
      ? transferLines.join("\n")
      : `Native value${ethAmountNote(tx.value)} on ${chain}`;

  const text = [
    subject,
    ``,
    description,
    ``,
    `Chain: ${chain}`,
    `From: ${tx.from}`,
    `To: ${tx.to ?? "—"}`,
    `Status: ${statusLabel(tx.status)}`,
    ``,
    `TX: ${tx.hash}`,
    ``,
    `— stupid wallet alerts`,
  ].join("\n");

  const htmlLines = transferLines.map(
    (l) => `<li style="font-size:15px;line-height:1.6;margin:2px 0;">${escapeHtml(l)}</li>`,
  );
  const html = render(notificationTemplate, {
    subject: escapeHtml(subject),
    subtitle: `${chain} · ${statusLabel(tx.status)}`,
    lines: htmlLines.join(""),
    hash: escapeHtml(tx.hash),
    tracked: displayAddress(data.trackedAddress),
  });

  return { subject, text, html, description };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => {
    switch (c) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return c;
    }
  });
}

/** Substitute {{key}} placeholders in an HTML template from a variables map. */
function render(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([\w]+)\s*\}\}/g, (_m, key: string) => vars[key] ?? "");
}

function statusLabel(status: string): string {
  return status === "success" ? "success" : "reverted";
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
    "Use this link to sign in (expires in 30 minutes):",
    magicLink,
    "",
    "If you didn't request this, you can ignore this email.",
  ].join("\n");
  const html = render(signInTemplate, { link: escapeHtml(magicLink) });
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
    replyTo: "hi@stupidtech.net",
    to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
}
