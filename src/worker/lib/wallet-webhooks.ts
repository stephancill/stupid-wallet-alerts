const BASE_URL = "https://wallet-webhooks.stupidtech.net";

export interface CreatedSubscription {
  id?: string;
  chainId: number;
  status: "active" | "pending" | "unsupported" | "quota" | "conflict" | "error" | "deleting";
  activeFromBlock?: string | null;
  reason?: string | null;
  message?: string | null;
}

/** Thin client for the customer (subscriber) wallet-webhooks API. */
export function webhooksClient(apiKey: string, webhookId: string) {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
  };

  return {
    /** Subscribe an address on one or more chains under this webhook. */
    async createSubscriptions(address: string, chainIds: number[]): Promise<CreatedSubscription[]> {
      const res = await fetch(`${BASE_URL}/v1/subscriptions`, {
        method: "POST",
        headers,
        body: JSON.stringify({ address, chainIds, webhookId }),
      });
      const json = (await res.json()) as { subscriptions?: CreatedSubscription[] };
      if (!res.ok || !json.subscriptions) {
        throw new Error(
          `wallet-webhooks subscribe failed (${res.status}): ${JSON.stringify(json)}`,
        );
      }
      return json.subscriptions;
    },

    /** Deactivate a single chain subscription. */
    async deactivateSubscription(subscriptionId: string): Promise<void> {
      const res = await fetch(`${BASE_URL}/v1/subscriptions/${subscriptionId}`, {
        method: "DELETE",
        headers,
      });
      if (!res.ok) {
        throw new Error(`wallet-webhooks delete failed (${res.status})`);
      }
    },

    /** List chains the provider resolves. */
    async listChains(): Promise<{ chainId: number; name: string; status: string }[]> {
      const res = await fetch(`${BASE_URL}/v1/chains`, { headers });
      const json = (await res.json()) as {
        chains: { chainId: number; name: string; status: string }[];
      };
      if (!res.ok) {
        throw new Error(`wallet-webhooks chains failed (${res.status})`);
      }
      return json.chains ?? [];
    },
  };
}
