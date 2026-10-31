import { PollinationsStretchClient } from "./pollinations-client.js";

const client = new PollinationsStretchClient();

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "STRETCH_PARAGRAPHS") {
        client
            .generateStretchLevels(message.paragraphs, message.model)
            .then((nodes) => sendResponse({ ok: true, nodes }))
            .catch((error) =>
                sendResponse({ ok: false, error: error.message }),
            );
        return true;
    }
    if (message?.type === "START_DEVICE_FLOW") {
        client
            .startDeviceFlow()
            .then((data) => sendResponse({ ok: true, data }))
            .catch((error) =>
                sendResponse({ ok: false, error: error.message }),
            );
        return true;
    }
    if (message?.type === "POLL_DEVICE_TOKEN") {
        client
            .pollDeviceToken(message.deviceCode)
            .then((result) => sendResponse({ ok: true, result }))
            .catch((error) =>
                sendResponse({ ok: false, error: error.message }),
            );
        return true;
    }
    return false;
});
