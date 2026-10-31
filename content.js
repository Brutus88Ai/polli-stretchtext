/**
 * Polli StretchText Content Script
 * Condenses any article/page to 1/6th of its words in place and lets readers
 * click inline [+] / [-] stretch chips to telescope paragraphs between
 * Level 0 (1/6th kernel), Level 1 (1/2 context), and Level 2 (100% original text).
 */

(() => {
    if (window.__polliStretchTextLoaded) return;
    window.__polliStretchTextLoaded = true;

    let isStretchActive = false;
    const trackedElements = [];

    function localTelescope(fullText) {
        const words = fullText.trim().split(/\s+/);
        const sentences = fullText
            .split(/(?<=[.!?])\s+/)
            .map((s) => s.trim())
            .filter(Boolean);
        const l0Count = Math.max(6, Math.ceil(words.length / 6));
        const l1Count = Math.max(14, Math.ceil(words.length / 2));
        return {
            level0: `${words.slice(0, l0Count).join(" ")}…`,
            level1:
                sentences.length > 1
                    ? sentences
                          .slice(0, Math.ceil(sentences.length / 2))
                          .join(" ")
                    : `${words.slice(0, l1Count).join(" ")}…`,
            level2: fullText,
        };
    }

    function renderNodeLevel(entry, level) {
        entry.level = Math.max(0, Math.min(2, level));
        const { el, data } = entry;
        const text =
            entry.level === 0
                ? data.level0
                : entry.level === 1
                  ? data.level1
                  : data.level2;
        const badgeLabel =
            entry.level === 0
                ? "1/6× Kernel"
                : entry.level === 1
                  ? "1/2× Context"
                  : "1× Original";

        el.innerHTML = "";
        el.classList.add("polli-stretch-paragraph");
        el.setAttribute("data-stretch-level", String(entry.level));

        const textSpan = document.createElement("span");
        textSpan.className = "polli-stretch-text";
        textSpan.textContent = `${text} `;
        el.appendChild(textSpan);

        const controls = document.createElement("span");
        controls.className = "polli-stretch-controls";

        const badge = document.createElement("span");
        badge.className = "polli-stretch-badge";
        badge.textContent = badgeLabel;
        controls.appendChild(badge);

        if (entry.level < 2) {
            const expandBtn = document.createElement("button");
            expandBtn.type = "button";
            expandBtn.className = "polli-stretch-chip polli-stretch-expand";
            expandBtn.textContent =
                entry.level === 0 ? "+ Stretch more" : "+ Full text";
            expandBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                renderNodeLevel(entry, entry.level + 1);
            });
            controls.appendChild(expandBtn);
        }

        if (entry.level > 0) {
            const shrinkBtn = document.createElement("button");
            shrinkBtn.type = "button";
            shrinkBtn.className = "polli-stretch-chip polli-stretch-shrink";
            shrinkBtn.textContent = "− Shrink";
            shrinkBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                renderNodeLevel(entry, entry.level - 1);
            });
            controls.appendChild(shrinkBtn);
        }

        el.appendChild(controls);
    }

    async function activateStretchText(model = "openai-fast") {
        if (isStretchActive) return;
        const candidates = Array.from(
            document.querySelectorAll("article p, main p, .stretch-target p, p"),
        ).filter((p) => {
            const txt = p.innerText?.trim() || "";
            return (
                txt.split(/\s+/).length >= 24 &&
                !p.closest(".polli-stretch-hud")
            );
        });

        const selected = candidates.slice(0, 18);
        if (!selected.length) return;

        const rawTexts = selected.map((p) => p.innerText.trim());
        let nodes = rawTexts.map(localTelescope);

        if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
            try {
                const res = await chrome.runtime.sendMessage({
                    type: "STRETCH_PARAGRAPHS",
                    paragraphs: rawTexts,
                    model,
                });
                if (res?.ok && Array.isArray(res.nodes)) {
                    nodes = res.nodes;
                }
            } catch {
                // Fallback to local telescope
            }
        }

        selected.forEach((el, idx) => {
            const entry = {
                el,
                originalHtml: el.innerHTML,
                data: nodes[idx] || localTelescope(rawTexts[idx]),
                level: 0,
            };
            trackedElements.push(entry);
            renderNodeLevel(entry, 0);
        });

        isStretchActive = true;
    }

    function restoreOriginalPage() {
        while (trackedElements.length) {
            const entry = trackedElements.pop();
            entry.el.classList.remove("polli-stretch-paragraph");
            entry.el.removeAttribute("data-stretch-level");
            entry.el.innerHTML = entry.originalHtml;
        }
        isStretchActive = false;
    }

    function setAllLevels(level) {
        trackedElements.forEach((entry) => renderNodeLevel(entry, level));
    }

    if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
        chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
            if (msg?.type === "TOGGLE_STRETCH") {
                if (isStretchActive) {
                    restoreOriginalPage();
                } else {
                    activateStretchText(msg.model);
                }
                sendResponse({ active: isStretchActive });
            } else if (msg?.type === "SET_ALL_LEVELS") {
                setAllLevels(msg.level);
                sendResponse({ active: isStretchActive });
            }
            return false;
        });
    }

    window.PolliStretchPageController = {
        activateStretchText,
        restoreOriginalPage,
        setAllLevels,
    };
})();
