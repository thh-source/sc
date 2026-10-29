import { spawn } from "node:child_process";
import http from "node:http";
import WebSocket from "ws";

async function testScreen() {
  const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  const proc = spawn(chromePath, [
    "--headless=new",
    "--remote-debugging-port=9224",
    "--disable-gpu",
    "http://localhost:8790/app.html#view=po-detail",
  ]);

  await new Promise((r) => setTimeout(r, 2000));

  http.get("http://localhost:9224/json", (res) => {
    let d = "";
    res.on("data", (c) => (d += c));
    res.on("end", async () => {
      const tabs = JSON.parse(d);
      const tab = tabs.find((t) => t.url.includes("app.html"));
      if (!tab) {
        console.log("Tab not found");
        proc.kill();
        return;
      }

      const ws = new WebSocket(tab.webSocketDebuggerUrl);
      ws.on("open", async () => {
        let msgId = 1;
        const send = (m, p = {}) =>
          new Promise((resolve) => {
            const id = msgId++;
            const handler = (data) => {
              const parsed = JSON.parse(data);
              if (parsed.id === id) {
                ws.off("message", handler);
                resolve(parsed.result);
              }
            };
            ws.on("message", handler);
            ws.send(JSON.stringify({ id, method: m, params: p }));
          });

        await send("Runtime.enable");
        await new Promise((r) => setTimeout(r, 3500));

        const evalRes = await send("Runtime.evaluate", {
          expression: `(() => {
            const text = document.body.innerText;
            const items = Array.from(document.querySelectorAll(".po-mobile-cards-wrap > div, .delivery-table tr")).map(el => el.innerText.trim()).filter(Boolean);
            const prItems = Array.from(document.querySelectorAll("table tr, .mobile-record-card")).map(el => el.innerText.trim()).filter(Boolean);
            return {
              url: window.location.href,
              title: document.querySelector("h1, h2, h3")?.innerText,
              itemsCount: items.length,
              itemsSample: items.slice(0, 5),
              bodySnippet: text.slice(0, 1000).replace(/\\n+/g, " ")
            };
          })()`,
          returnByValue: true,
        });

        console.log("PO Detail Eval:", JSON.stringify(evalRes.result.value, null, 2));
        ws.close();
        proc.kill();
        process.exit(0);
      });
    });
  });
}
testScreen();
