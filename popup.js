import { PollinationsStretchClient } from "./pollinations-client.js";

const client = new PollinationsStretchClient();

async function refreshStatus() {
    const token = await client.getToken();
    const badge = document.getElementById("popup-auth-badge");
    if (token) {
        badge.textContent = `BYOP (${token.slice(0, 6)}…)`;
    } else {
        badge.textContent = "0-Pollen Local Mode";
    }
}

async function sendToActiveTab(payload) {
    if (typeof chrome === "undefined" || !chrome.tabs) return;
    const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
    });
    if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, payload);
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    await refreshStatus();

    document.getElementById("btn-toggle-page").addEventListener("click", () => {
        const model = document.getElementById("popup-model").value;
        sendToActiveTab({ type: "TOGGLE_STRETCH", model });
    });

    [0, 1, 2].forEach((level) => {
        document
            .getElementById(`btn-level-${level}`)
            .addEventListener("click", () => {
                sendToActiveTab({ type: "SET_ALL_LEVELS", level });
            });
    });

    document
        .getElementById("btn-device-flow")
        .addEventListener("click", async () => {
            const box = document.getElementById("device-flow-box");
            box.style.display = "block";
            box.textContent = "Requesting BYOP device code…";
            try {
                const flow = await client.startDeviceFlow();
                const verifyUrl =
                    flow.verification_uri_complete ||
                    flow.verification_uri ||
                    "https://enter.pollinations.ai/device";
                box.innerHTML = `Code: <strong>${flow.user_code}</strong> — <a href="${verifyUrl}" target="_blank" rel="noopener">Approve on Pollinations</a>`;
                const interval = setInterval(async () => {
                    const poll = await client.pollDeviceToken(flow.device_code);
                    if (poll.status === "authorized") {
                        clearInterval(interval);
                        box.textContent = "✔ Connected with your own Pollen!";
                        await refreshStatus();
                    }
                }, (flow.interval || 5) * 1000);
            } catch (err) {
                box.textContent = `Device flow note: ${err.message}`;
            }
        });
});
