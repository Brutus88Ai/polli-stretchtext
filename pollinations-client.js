/**
 * Polli StretchText — Pollinations BYOP Client (Device Flow + PKCE + Chat Completions)
 * Readers pay with their own Pollen via enter.pollinations.ai Device Flow or <polli-connect>.
 */

export const POLLINATIONS_API_BASE = "https://gen.pollinations.ai";
export const POLLINATIONS_ENTER_BASE = "https://enter.pollinations.ai";
export const APP_CLIENT_ID = "pk_zM4Wvtd1rgWXRmLP";
export const DEFAULT_STRETCH_MODEL = "openai-fast";

const TOKEN_KEY = "polli_stretch_byop_token";

export class PollinationsStretchClient {
    constructor() {
        this.apiBase = POLLINATIONS_API_BASE;
        this.enterBase = POLLINATIONS_ENTER_BASE;
    }

    async getToken() {
        if (typeof chrome !== "undefined" && chrome.storage?.local) {
            const data = await chrome.storage.local.get([TOKEN_KEY]);
            if (data[TOKEN_KEY]) return data[TOKEN_KEY];
        }
        if (typeof localStorage !== "undefined") {
            return (
                localStorage.getItem(TOKEN_KEY) ||
                localStorage.getItem("polli:key") ||
                localStorage.getItem("pollinations_api_key")
            );
        }
        return null;
    }

    async setToken(token) {
        const clean = token ? token.trim() : "";
        if (typeof chrome !== "undefined" && chrome.storage?.local) {
            if (clean) {
                await chrome.storage.local.set({ [TOKEN_KEY]: clean });
            } else {
                await chrome.storage.local.remove([TOKEN_KEY]);
            }
        }
        if (typeof localStorage !== "undefined") {
            if (clean) {
                localStorage.setItem(TOKEN_KEY, clean);
            } else {
                localStorage.removeItem(TOKEN_KEY);
            }
        }
    }

    /**
     * RFC 8628 OAuth 2.0 Device Authorization Grant for Browser Extensions
     */
    async startDeviceFlow() {
        const response = await fetch(`${this.enterBase}/api/device/code`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                client_id: APP_CLIENT_ID,
                scope: "generate:text account:balance",
            }),
        });
        if (!response.ok) {
            throw new Error(`Device code request failed (${response.status})`);
        }
        return response.json();
    }

    async pollDeviceToken(deviceCode) {
        const response = await fetch(`${this.enterBase}/api/device/token`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                client_id: APP_CLIENT_ID,
                device_code: deviceCode,
                grant_type: "urn:ietf:params:oauth:grant-type:device_code",
            }),
        });
        const data = await response.json().catch(() => ({}));
        if (response.ok && (data.access_token || data.key)) {
            const token = data.access_token || data.key;
            await this.setToken(token);
            return { status: "authorized", token };
        }
        return {
            status: data.error || "authorization_pending",
            error_description: data.error_description,
        };
    }

    /**
     * Generates 3 telescoping stretch levels for an article paragraph:
     * - level0: 1/6th length ultra-condensed kernel with inline [anchor] hooks
     * - level1: 1/2 length medium expansion
     * - level2: full original paragraph
     */
    async generateStretchLevels(paragraphs, model = DEFAULT_STRETCH_MODEL) {
        const token = await this.getToken();
        if (!token) {
            return paragraphs.map((p) => this.buildLocalStretchNode(p));
        }

        const systemPrompt = [
            "You are a Ted Nelson StretchText compiler.",
            "Given an array of article paragraphs, return JSON `{ nodes: [{ summary16, summary50, keyTerm }] }` with one entry per paragraph:",
            "- `summary16`: condensed to roughly 1/6th of the words while preserving the core claim.",
            "- `summary50`: expanded to roughly 1/2 of the words with supporting context.",
            "- `keyTerm`: 2-5 word expandable anchor phrase inside `summary16`.",
        ].join("\n");

        const response = await fetch(`${this.apiBase}/v1/chat/completions`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model,
                response_format: { type: "json_object" },
                messages: [
                    { role: "system", content: systemPrompt },
                    {
                        role: "user",
                        content: JSON.stringify({ paragraphs }),
                    },
                ],
            }),
        });

        if (!response.ok) {
            const err = await response.text().catch(() => "");
            throw new Error(
                `Pollinations /v1/chat/completions returned ${response.status}: ${err}`,
            );
        }
        const completion = await response.json();
        const parsed = JSON.parse(
            completion.choices?.[0]?.message?.content || "{}",
        );
        const nodes = Array.isArray(parsed.nodes) ? parsed.nodes : [];
        return paragraphs.map((fullText, i) => {
            const n = nodes[i] || {};
            const fallback = this.buildLocalStretchNode(fullText);
            return {
                level0: n.summary16 || fallback.level0,
                level1: n.summary50 || fallback.level1,
                level2: fullText,
                keyTerm: n.keyTerm || fallback.keyTerm,
            };
        });
    }

    buildLocalStretchNode(fullText) {
        const sentences = fullText
            .split(/(?<=[.!?])\s+/)
            .map((s) => s.trim())
            .filter(Boolean);
        const words = fullText.trim().split(/\s+/);
        const targetL0 = Math.max(6, Math.ceil(words.length / 6));
        const targetL1 = Math.max(14, Math.ceil(words.length / 2));

        const level0 =
            sentences[0] && sentences[0].split(/\s+/).length <= targetL0 + 6
                ? sentences[0]
                : `${words.slice(0, targetL0).join(" ")}…`;
        const level1 =
            sentences.length > 1
                ? sentences.slice(0, Math.ceil(sentences.length / 2)).join(" ")
                : `${words.slice(0, targetL1).join(" ")}…`;
        const keyTerm = words.slice(0, 3).join(" ");

        return {
            level0,
            level1,
            level2: fullText,
            keyTerm,
        };
    }
}
